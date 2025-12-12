
import { Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

export interface DeepResearchResult {
    query: string;
    googleDocId?: string;
    googleDocUrl?: string;
    status: 'completed' | 'failed' | 'cancelled';
    error?: string;
}

export interface ResearchInfo {
    title: string | null;        // Session title (short name)
    firstHeading: string | null; // First heading in the document
    sessionId: string | null;
}

export class GeminiClient {
    private page: Page;
    private deepResearchEnabled = false;

    constructor(page: Page) {
        this.page = page;
    }

    async init(sessionId?: string) {
        console.log('[Gemini] Initializing...');

        const targetUrl = sessionId
            ? `https://gemini.google.com/app/${sessionId}`
            : 'https://gemini.google.com/app';
        console.log(`[Gemini] Navigating to: ${targetUrl}`);
        await this.page.goto(targetUrl, { waitUntil: 'domcontentloaded' });

        await this.page.waitForTimeout(1500);

        const signInButton = this.page.locator('button:has-text("Sign in"), a:has-text("Sign in")');
        if (await signInButton.count() > 0) {
            console.warn('[Gemini] Sign in required.');
            await this.dumpState('gemini_auth_required');
            throw new Error('Gemini requires authentication. Please run rsrch auth first.');
        }

        const closeButtons = this.page.locator('button[aria-label*="Close"], button:has-text("Got it"), button:has-text("Skip")');
        if (await closeButtons.count() > 0) {
            await closeButtons.first().click().catch(() => { });
            await this.page.waitForTimeout(500);
        }

        try {
            await this.page.waitForSelector('chat-app, .input-area, textarea, div[contenteditable="true"]', { timeout: 10000 });
        } catch (e) {
            console.warn('[Gemini] Timeout waiting for chat interface.');
            await this.dumpState('gemini_init_fail');
            throw e;
        }

        console.log('[Gemini] Ready.');
    }

    getCurrentSessionId(): string | null {
        const url = this.page.url();
        const match = url.match(/\/app\/([a-zA-Z0-9]+)/);
        return match ? match[1] : null;
    }

    /**
     * Get the underlying Playwright page instance
     */
    getPage(): Page {
        return this.page;
    }

    async openSession(sessionId: string): Promise<void> {
        const url = `https://gemini.google.com/app/${sessionId}`;
        console.log(`[Gemini] Navigating to: ${url}`);
        await this.page.goto(url, { waitUntil: 'domcontentloaded' });
        await this.page.waitForTimeout(2000);
    }

    async listSessions(limit: number = 20, offset: number = 0): Promise<{ name: string; id: string | null }[]> {
        const sessions: { name: string; id: string | null }[] = [];
        try {
            // Ensure sidebar is visible - sometimes hidden
            const menuButton = this.page.locator('button[aria-label*="Hlavní nabídka"], button[aria-label*="Main menu"]').first();
            if (await menuButton.count() > 0) {
                // Assuming visible for now
            }

            const targetCount = offset + limit;
            console.log(`[Gemini] listing sessions (limit: ${limit}, offset: ${offset}, target: ${targetCount})...`);

            let sessionItems = this.page.locator('div.conversation[role="button"]');
            let count = await sessionItems.count();

            // Scroll to load more if needed
            let retries = 0;
            while (count < targetCount && retries < 5) {
                const preCount = count;
                const lastItem = sessionItems.last();
                if (await lastItem.isVisible()) {
                    await lastItem.scrollIntoViewIfNeeded();
                    await this.page.waitForTimeout(1000); // Give time for infinite scroll
                }

                // Check if "show more" button exists (for deep history)
                const showMore = this.page.locator('button').filter({ hasText: /Show more|Zobrazit více/i }).first();
                if (await showMore.isVisible()) {
                    console.log('[Gemini] Clicking "Show more"...');
                    await showMore.click();
                    await this.page.waitForTimeout(1000);
                }

                sessionItems = this.page.locator('div.conversation[role="button"]');
                count = await sessionItems.count();
                console.log(`[Gemini] Loaded ${count} sessions (Goal: ${targetCount})...`);

                if (count === preCount) {
                    retries++;
                } else {
                    retries = 0;
                }
            }

            // Define range to extract
            const start = Math.min(offset, count);
            const end = Math.min(offset + limit, count);

            if (start >= count) {
                console.log('[Gemini] Offset beyond available sessions.');
                return [];
            }

            for (let i = start; i < end; i++) {
                const item = sessionItems.nth(i);
                // Get name - often includes time or "Pinned", might need cleaning
                let name = await item.innerText().catch(() => '');
                name = name.split('\n')[0]; // Take first line usually

                // ID is hard to get without clicking. We might try to parse it if we can find a link
                // But for now, we just list the names.
                // If we really need IDs, we'd have to crawl.
                // Let's see if there's an anchor tag nearby?
                // Subagent found no anchors. So ID is null unless we are currently ON that page.

                let id: string | null = null;

                // Try to extract ID from jslog attribute
                // Format: ... ["c_ID", ...]
                const jslog = await item.getAttribute('jslog').catch(() => null);
                if (jslog) {
                    const match = jslog.match(/\["c_([a-zA-Z0-9]+)"/);
                    if (match) {
                        id = match[1];
                    }
                }

                // Fallback: Check if active/selected
                if (!id) {
                    const isActive = await item.getAttribute('class').then(c => c?.includes('selected')).catch(() => false);
                    if (isActive) {
                        id = this.getCurrentSessionId();
                    }
                }

                if (name.trim()) {
                    sessions.push({ name: name.trim(), id });
                }
            }
        } catch (e) {
            console.warn('[Gemini] Error listing sessions:', e);
        }

        console.log(`[Gemini] Found ${sessions.length} sessions (Request: ${offset}-${offset + limit})`);
        return sessions;
    }

    /**
     * Crawls recent sessions to find Deep Research documents.
     * This involves navigating to each session in the sidebar.
     */
    async listDeepResearchDocuments(limit: number = 10): Promise<ResearchInfo[]> {
        const docs: ResearchInfo[] = [];
        console.log(`[Gemini] Crawling last ${limit} sessions for Deep Research...`);

        try {
            // Get count of visible sessions
            const sessionItems = this.page.locator('div.conversation[role="button"]');
            let count = await sessionItems.count();
            if (count > limit) count = limit;

            for (let i = 0; i < count; i++) {
                // Re-locate items in case of DOM updates
                const items = this.page.locator('div.conversation[role="button"]');
                if (await items.count() <= i) break;

                const item = items.nth(i);
                const name = await item.innerText().catch(() => 'Unknown');
                console.log(`[Gemini] Checking session ${i + 1}/${count}: ${name.split('\n')[0]}...`);

                try {
                    // Force click to bypass overlays (e.g. infinite-scroller issues)
                    await item.click({ force: true });

                    // Wait for navigation/load
                    await this.page.waitForTimeout(2000);
                    // Wait for either deep research panel or standard response container
                    // But standard response might take longer if generating. 
                    // Assuming we are browsing history, it should load fast.

                    // Check for Deep Research Panel
                    const deepResearchPanel = this.page.locator('deep-research-immersive-panel');
                    if (await deepResearchPanel.count() > 0) {
                        console.log(`[Gemini] Found Deep Research in session: ${name}`);
                        const info = await this.getResearchInfo();
                        if (info.title || info.firstHeading) {
                            docs.push(info);
                        }
                    }
                } catch (err) {
                    console.warn(`[Gemini] Failed to process session ${i}:`, err);
                }
            }
        } catch (e) {
            console.error('[Gemini] Error listing deep research documents:', e);
        }

        return docs;
    }

    async exportCurrentToGoogleDocs(): Promise<{ docId: string | null; docUrl: string | null; docTitle: string | null }> {
        return this.exportToGoogleDocs();
    }

    /**
     * Get extracted info from the current Deep Research session (latest document)
     */
    async getResearchInfo(): Promise<ResearchInfo> {
        const docs = await this.getAllResearchDocsInSession();
        return docs.length > 0 ? docs[docs.length - 1] : { title: null, firstHeading: null, sessionId: this.getCurrentSessionId() };
    }

    /**
     * Get all deep research documents in the current session
     */
    async getAllResearchDocsInSession(): Promise<ResearchInfo[]> {
        console.log('[Gemini] Extracting all research docs from session...');
        const sessionId = this.getCurrentSessionId();
        const docs: ResearchInfo[] = [];

        try {
            // Wait for content (either standard or deep research)
            await this.page.waitForTimeout(1000);

            // Deep Research panels
            const panels = this.page.locator('deep-research-immersive-panel');
            const count = await panels.count();

            if (count > 0) {
                console.log(`[Gemini] Found ${count} Deep Research panels.`);
                for (let i = 0; i < count; i++) {
                    const panel = panels.nth(i);

                    // Title in toolbar
                    const titleEl = panel.locator('h2.title-text').first();
                    let title = await titleEl.innerText().catch(() => null);

                    if (!title) {
                        // Fallback title extraction
                        title = await this.page.title().then(t => t.replace('Gemini - ', '').trim()).catch(() => null);
                    }

                    // First heading in content
                    const firstH1 = panel.locator('message-content h1').first();
                    let firstHeading = await firstH1.innerText().catch(() => null);

                    if (firstHeading) {
                        firstHeading = firstHeading.split('\n')[0].trim();
                    }

                    docs.push({
                        title,
                        firstHeading,
                        sessionId
                    });
                }
            } else {
                // Fallback: Extract from last model response if available
                const responses = this.page.locator('model-response');
                if (await responses.count() > 0) {
                    const last = responses.last();
                    const fullText = await last.innerText().catch(() => '');

                    if (fullText.length > 50) {
                        let title: string | null = null;
                        let firstHeading: string | null = null;

                        const pageTitle = await this.page.title();
                        if (pageTitle) {
                            title = pageTitle.replace('Gemini - ', '').replace(' - Google', '').trim();
                        }

                        // Try to find first H1 in content
                        const h1 = last.locator('h1').first();
                        if (await h1.count() > 0) {
                            firstHeading = await h1.innerText().catch(() => null);
                        } else {
                            // Heuristic: First long line
                            const lines = fullText.split('\n').map(l => l.trim()).filter(l => l.length > 20);
                            if (lines.length > 0) firstHeading = lines[0];
                        }

                        if (firstHeading) firstHeading = firstHeading.split('\n')[0].trim();

                        docs.push({
                            title,
                            firstHeading,
                            sessionId
                        });
                    }
                }
            }

        } catch (e) {
            console.warn('[Gemini] Error extracting research docs:', e);
        }

        return docs;
    }

    async sendMessage(message: string, waitForResponse: boolean = true): Promise<string | null> {
        console.log(`[Gemini] Sending message: "${message.substring(0, 50)}${message.length > 50 ? '...' : ''}"`);

        try {
            const inputSelector = 'div[contenteditable="true"], textarea, input[type="text"]';
            const input = this.page.locator(inputSelector).first();
            await input.waitFor({ state: 'visible', timeout: 10000 });

            const responsesBefore = await this.page.locator('model-response').count();

            await input.fill(message);
            await this.page.waitForTimeout(300);
            await input.press('Enter');

            if (!waitForResponse) {
                return null;
            }

            console.log('[Gemini] Waiting for response...');
            const maxWait = 60000;
            const pollInterval = 1000;
            let elapsed = 0;
            let lastResponseLength = 0;
            let stableCount = 0;

            while (elapsed < maxWait) {
                const responsesNow = await this.page.locator('model-response').count();
                if (responsesNow > responsesBefore) {
                    await this.page.waitForTimeout(1000);
                    const latestResponse = this.page.locator('model-response').last();
                    const currentText = await latestResponse.innerText().catch(() => '');

                    if (currentText.length === lastResponseLength && currentText.length > 50) {
                        stableCount++;
                        if (stableCount >= 2) {
                            console.log('[Gemini] Response stabilized');
                            break;
                        }
                    } else {
                        stableCount = 0;
                        lastResponseLength = currentText.length;
                    }
                }
                await this.page.waitForTimeout(pollInterval);
                elapsed += pollInterval;
            }

            const response = await this.getLatestResponse();
            console.log(`[Gemini] Response received (${response?.length || 0} chars)`);
            return response;

        } catch (e) {
            console.error('[Gemini] Failed to send message:', e);
            await this.dumpState('send_message_fail');
            return null;
        }
    }

    async getResponses(): Promise<string[]> {
        console.log('[Gemini] Getting all responses...');
        const responses: string[] = [];

        try {
            await this.page.waitForTimeout(500);
            const responseElements = this.page.locator('model-response');
            const count = await responseElements.count();
            console.log(`[Gemini] Found ${count} elements with selector: model-response`);

            for (let i = 0; i < count; i++) {
                const text = await responseElements.nth(i).innerText().catch(() => '');
                if (text.trim()) {
                    responses.push(text.trim());
                }
            }

            console.log(`[Gemini] Found ${responses.length} responses`);
        } catch (e) {
            console.error('[Gemini] Failed to get responses:', e);
        }

        return responses;
    }

    async getLatestResponse(): Promise<string | null> {
        try {
            const responseElements = this.page.locator('model-response');
            const count = await responseElements.count();
            if (count === 0) return null;

            const lastResponse = responseElements.nth(count - 1);
            return await lastResponse.innerText().catch(() => null);
        } catch (e) {
            console.error('[Gemini] Failed to get latest response:', e);
            return null;
        }
    }

    async getResponse(index: number): Promise<string | null> {
        const responses = await this.getResponses();
        if (responses.length === 0) return null;

        if (index > 0) {
            // Positive index: 1 = first
            const idx = index - 1;
            return idx < responses.length ? responses[idx] : null;
        } else {
            // Negative index: -1 = last
            const idx = responses.length + index;
            return idx >= 0 ? responses[idx] : null;
        }
    }

    private async exportToGoogleDocs(): Promise<{ docId: string | null; docUrl: string | null; docTitle: string | null }> {
        console.log('[Gemini] Exporting to Google Docs...');

        try {
            console.log('[Gemini] Waiting for research panel to load...');

            const panelSelectors = ['model-response', '.response-container', '[data-message-id]'];
            let panelFound = false;
            for (let i = 0; i < 15 && !panelFound; i++) {
                for (const selector of panelSelectors) {
                    const panel = this.page.locator(selector).first();
                    if (await panel.count() > 0 && await panel.isVisible()) {
                        panelFound = true;
                        console.log(`[Gemini] Research panel found (${selector})`);
                        break;
                    }
                }
                if (!panelFound) {
                    await this.page.waitForTimeout(1000);
                }
            }

            await this.page.waitForTimeout(1000);

            // Find export button
            const exportButtonSelectors = [
                'button[aria-label="Nabídka pro export"]',
                'button[aria-label="Export menu"]',
                'button[aria-label*="Nabídka pro export"]',
                'button[aria-label*="Export menu"]'
            ];

            let exportButton = null;
            for (const selector of exportButtonSelectors) {
                try {
                    const btn = this.page.locator(selector).first();
                    if (await btn.count() > 0 && await btn.isVisible()) {
                        exportButton = btn;
                        console.log(`[Gemini] Found export button with selector: ${selector}`);
                        break;
                    }
                } catch (e) { /* continue */ }
            }

            if (!exportButton) {
                console.warn('[Gemini] Export button not found');
                await this.dumpState('export_button_not_found');
                return { docId: null, docUrl: null, docTitle: null };
            }

            console.log('[Gemini] Clicking export dropdown...');
            await exportButton.click();
            await this.page.waitForTimeout(1000);

            // Find docs export option
            const docsOptionSelectors = [
                'button[role="menuitem"]:has-text("Exportovat do Dokumentů")',
                'button[role="menuitem"]:has-text("Export to Docs")',
                'button:has-text("Exportovat do Dokumentů")',
                'button:has-text("Export to Docs")'
            ];

            let docsOptionClicked = false;
            for (const selector of docsOptionSelectors) {
                const docsOption = this.page.locator(selector).first();
                if (await docsOption.count() > 0 && await docsOption.isVisible()) {
                    console.log(`[Gemini] Clicking Google Docs export option: ${selector}`);

                    const newPagePromise = this.page.context().waitForEvent('page', { timeout: 30000 });
                    await docsOption.click();
                    docsOptionClicked = true;

                    console.log('[Gemini] Waiting for Google Docs tab...');
                    const newPage = await newPagePromise;

                    await newPage.waitForLoadState('domcontentloaded');

                    // Poll for actual URL
                    let docUrl = '';
                    let docId: string | null = null;
                    let docTitle: string | null = null;

                    for (let i = 0; i < 20; i++) {
                        docUrl = newPage.url();
                        if (docUrl && docUrl !== 'about:blank' && docUrl.includes('docs.google.com')) {
                            break;
                        }
                        await this.page.waitForTimeout(500);
                    }

                    if (docUrl.includes('docs.google.com')) {
                        await newPage.waitForLoadState('load').catch(() => { });
                        // Extract title
                        docTitle = await newPage.title().then(t => t.replace(' - Google Docs', '').replace(' - Dokumenty Google', '').trim()).catch(() => null);
                    }

                    const docMatch = docUrl.match(/\/document(?:\/u\/\d+)?\/d\/([a-zA-Z0-9_-]+)/);
                    if (docMatch) {
                        docId = docMatch[1];
                    }

                    console.log(`[Gemini] Google Doc created: ${docId}`);
                    console.log(`[Gemini] URL: ${docUrl}`);
                    console.log(`[Gemini] Title: ${docTitle}`);

                    await newPage.close();
                    return { docId, docUrl, docTitle };
                }
            }

            if (!docsOptionClicked) {
                console.warn('[Gemini] Export to Docs option not found');
                await this.dumpState('export_docs_option_not_found');
            }

            return { docId: null, docUrl: null, docTitle: null };

        } catch (e) {
            console.error('[Gemini] Export to Google Docs failed:', e);
            await this.dumpState('export_to_docs_fail');
            return { docId: null, docUrl: null, docTitle: null };
        }
    }

    async research(query: string): Promise<string> {
        console.log(`[Gemini] Researching: "${query}"`);
        try {
            const inputSelector = 'div[contenteditable="true"], textarea, input[type="text"]';
            const input = this.page.locator(inputSelector).first();
            await input.waitFor({ state: 'visible', timeout: 20000 });
            await input.fill(query);
            await this.page.waitForTimeout(500);
            await input.press('Enter');

            console.log('[Gemini] Waiting for response...');
            const responseSelector = 'model-response, .message-content, .response-container-content';
            await this.page.waitForSelector(responseSelector, { timeout: 20000 });
            await this.page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => { });

            const responses = this.page.locator(responseSelector);
            const count = await responses.count();
            if (count > 0) {
                const lastResponse = responses.last();
                const text = await lastResponse.innerText();
                console.log('[Gemini] Response extracted.');
                return text;
            } else {
                throw new Error('No response elements found.');
            }
        } catch (e) {
            console.error('[Gemini] Research failed:', e);
            await this.dumpState('gemini_research_fail');
            throw e;
        }
    }

    async dumpState(name: string) {
        try {
            const dataDir = path.join(process.cwd(), 'data');
            if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
            const timestamp = Date.now();
            const cleanName = name.toLowerCase().replace(/[^a-z0-9]/g, '_');
            const htmlPath = path.join(dataDir, `${cleanName}_${timestamp}.html`);
            const pngPath = path.join(dataDir, `${cleanName}_${timestamp}.png`);
            const html = await this.page.evaluate(() => document.body.outerHTML);
            fs.writeFileSync(htmlPath, html);
            await this.page.screenshot({ path: pngPath, fullPage: true });
            console.log(`[Gemini] Dumped state to ${htmlPath} / ${pngPath}`);
        } catch (e) {
            console.error('[Gemini] Failed to dump state:', e);
        }
    }

    // ===== Deep Research Parser Methods =====

    /**
     * Navigate to a specific research session by URL or session ID.
     */
    async navigateToResearchSession(sessionIdOrUrl: string): Promise<boolean> {
        console.log(`[Gemini] Navigating to research session: ${sessionIdOrUrl}`);

        try {
            let url = sessionIdOrUrl;
            if (!url.startsWith('http')) {
                url = `https://gemini.google.com/app/${sessionIdOrUrl}`;
            }

            await this.page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
            await this.page.waitForTimeout(3000);
            await this.page.waitForSelector('model-response, div.container', { timeout: 15000 });

            console.log('[Gemini] ✅ Navigated to research session');
            return true;
        } catch (e: any) {
            console.error('[Gemini] Failed to navigate to session:', e.message);
            return false;
        }
    }

    /**
     * Open the Deep Research document by clicking "Otevřít" (Open) button.
     */
    async openResearchDocument(): Promise<boolean> {
        console.log('[Gemini] Looking for research document Open button...');

        try {
            const openButton = this.page.locator('button:has-text("Otevřít"), button:has-text("Open")').first();

            if (await openButton.count() > 0) {
                console.log('[Gemini] Found Open button, clicking...');
                await openButton.click();
                await this.page.waitForTimeout(3000);
                console.log('[Gemini] ✅ Opened research document');
                return true;
            } else {
                console.log('[Gemini] No Open button found');
                return false;
            }
        } catch (e: any) {
            console.error('[Gemini] Failed to open document:', e.message);
            return false;
        }
    }

    /**
     * Parse the current deep research session into a structured format.
     */
    async parseResearch(sessionIdOrUrl?: string): Promise<ParsedResearch | null> {
        console.log('[Gemini] Parsing research content...');

        try {
            if (sessionIdOrUrl) {
                await this.navigateToResearchSession(sessionIdOrUrl);
            }

            await this.page.waitForSelector('model-response, div.container', { timeout: 10000 }).catch(() => { });
            await this.openResearchDocument();
            await this.page.waitForTimeout(2000);

            const title = await this.extractTitle();
            console.log(`[Gemini] Title: ${title}`);

            const { content, contentHtml, headings } = await this.extractContent();
            console.log(`[Gemini] Extracted ${headings.length} headings, ${content.length} chars`);

            const citations = await this.extractCitations();
            console.log(`[Gemini] Found ${citations.length} citations`);

            return {
                title: title || 'Untitled Research',
                query: '',
                content,
                contentHtml,
                contentMarkdown: content,
                headings,
                citations,
                reasoningSteps: [],
                researchFlow: [],
                createdAt: new Date().toISOString()
            };
        } catch (e: any) {
            console.error('[Gemini] Failed to parse research:', e);
            await this.dumpState('parse_research_fail');
            return null;
        }
    }

    private async extractTitle(): Promise<string | null> {
        const skipTitles = ['chaty', 'konverzace', 'gemini', 'conversations'];
        const headings = this.page.locator('model-response h1, model-response h2, div.container h1, div.container h2');
        const count = await headings.count();

        for (let i = 0; i < count; i++) {
            const text = await headings.nth(i).textContent();
            if (text) {
                const trimmed = text.trim();
                if (skipTitles.some(skip => trimmed.toLowerCase().startsWith(skip))) continue;
                if (trimmed.length < 10) continue;
                return trimmed;
            }
        }
        return null;
    }

    private async extractContent(): Promise<{ content: string, contentHtml: string, headings: string[] }> {
        let allContent = '';
        let allHtml = '';
        const headings: string[] = [];

        // First, try to extract from the actual research document (thought-items)
        // This is where the real research results are, not the chat history
        const immersivePanel = this.page.locator('deep-research-immersive-panel');
        const hasImmersive = await immersivePanel.count() > 0;

        if (hasImmersive) {
            console.log('[Gemini] Extracting from immersive research panel (thought-items)...');

            // Extract from thought-item elements - these contain the actual findings
            const thoughtItems = this.page.locator('deep-research-immersive-panel thought-item');
            const thoughtCount = await thoughtItems.count();
            console.log(`[Gemini] Found ${thoughtCount} thought items`);

            for (let i = 0; i < thoughtCount; i++) {
                try {
                    const thought = thoughtItems.nth(i);

                    // Get heading from .thought-header
                    const header = await thought.locator('.thought-header').textContent().catch(() => null);
                    if (header && header.trim().length > 5) {
                        headings.push(header.trim());
                        allContent += `\n## ${header.trim()}\n\n`;
                        allHtml += `<h2>${header.trim()}</h2>`;
                    }

                    // Get content from the body div (second .gds-body-m, not the header)
                    // Both header and body have .gds-body-m, so we need to get the one that's NOT .thought-header
                    const bodyLocator = thought.locator('.gds-body-m:not(.thought-header)').first();
                    const body = await bodyLocator.textContent().catch(() => null);
                    if (body && body.trim().length > 10) {
                        allContent += body.trim() + '\n\n';
                        const bodyHtml = await bodyLocator.evaluate(node => node.innerHTML).catch(() => body);
                        allHtml += `<p>${bodyHtml}</p>`;
                    }
                } catch (e) { }
            }
        }

        // Fallback: if no immersive panel or no content, try model-response
        if (allContent.trim().length < 500) {
            console.log('[Gemini] Fallback: extracting from model-response...');
            const modelResponses = this.page.locator('model-response');
            const responseCount = await modelResponses.count();

            for (let i = 0; i < responseCount; i++) {
                try {
                    const el = modelResponses.nth(i);
                    const html = await el.evaluate(node => node.innerHTML);
                    const text = await el.evaluate(node => node.textContent || '');
                    allHtml += html + '\n';
                    allContent += text + '\n';
                } catch (e) { }
            }

            const headingEls = this.page.locator('model-response h1, model-response h2, model-response h3');
            const headingCount = await headingEls.count();
            for (let i = 0; i < Math.min(headingCount, 30); i++) {
                const text = await headingEls.nth(i).textContent();
                if (text && text.trim().length > 5 && !headings.includes(text.trim())) {
                    headings.push(text.trim());
                }
            }
        }

        return { content: allContent.trim(), contentHtml: allHtml.trim(), headings };
    }

    private async extractCitations(): Promise<Citation[]> {
        const citations: Citation[] = [];
        const excludeDomains = ['google.com', 'gstatic.com', 'gemini.google.com'];

        const links = this.page.locator('model-response a[href^="http"], div.container a[href^="http"]');
        const linkCount = await links.count();
        console.log(`[Gemini] Found ${linkCount} links in content`);

        for (let i = 0; i < Math.min(linkCount, 100); i++) {
            try {
                const link = links.nth(i);
                const href = await link.getAttribute('href');
                const text = await link.textContent();

                if (!href) continue;

                const url = new URL(href);
                const domain = url.hostname.replace('www.', '');
                if (excludeDomains.some(d => domain.includes(d))) continue;
                if (citations.some(c => c.url === href)) continue;

                citations.push({
                    id: citations.length + 1,
                    text: text?.trim() || domain,
                    url: href,
                    domain: domain,
                    usedInSections: []
                });
            } catch (e) { }
        }

        console.log(`[Gemini] Extracted ${citations.length} unique citations`);
        return citations;
    }

    /**
     * Create a Google Doc with the parsed research content.
     */
    async createGoogleDoc(parsed: ParsedResearch, customTitle?: string): Promise<{ docId: string, docUrl: string } | null> {
        console.log('[Gemini] Creating Google Doc...');

        try {
            const title = customTitle || parsed.title;

            await this.page.goto('https://docs.google.com/document/create', {
                waitUntil: 'networkidle',
                timeout: 60000
            });
            await this.page.waitForTimeout(3000);

            await this.page.waitForSelector('.docs-title-input, [aria-label*="Document title"]', { timeout: 15000 });

            const docUrl = this.page.url();
            const docIdMatch = docUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
            const docId = docIdMatch ? docIdMatch[1] : '';
            console.log(`[Gemini] Created doc: ${docId}`);

            const titleInput = this.page.locator('.docs-title-input, input[aria-label*="Document title"]').first();
            if (await titleInput.count() > 0) {
                await titleInput.click();
                await this.page.waitForTimeout(500);
                await titleInput.fill(title);
                await this.page.keyboard.press('Enter');
                await this.page.waitForTimeout(1000);
            }

            // Type content into doc body
            const docBody = this.page.locator('.kix-appview-editor, [contenteditable="true"]').first();
            if (await docBody.count() > 0) {
                await docBody.click();
                await this.page.waitForTimeout(500);

                // Type title and content
                const docContent = `# ${parsed.title}\n\n${parsed.content}`;
                const chunks = this.splitIntoChunks(docContent, 3000);
                for (const chunk of chunks) {
                    await this.page.keyboard.type(chunk, { delay: 1 });
                    await this.page.waitForTimeout(100);
                }
            }

            console.log(`[Gemini] ✅ Created Google Doc: ${title}`);
            return { docId, docUrl };

        } catch (e: any) {
            console.error('[Gemini] Failed to create Google Doc:', e.message);
            await this.dumpState('create_doc_fail');
            return null;
        }
    }

    private splitIntoChunks(text: string, chunkSize: number): string[] {
        const chunks: string[] = [];
        for (let i = 0; i < text.length; i += chunkSize) {
            chunks.push(text.slice(i, i + chunkSize));
        }
        return chunks;
    }

    /**
     * Export parsed research to complete markdown with all sections.
     */
    exportToMarkdown(parsed: ParsedResearch): string {
        let md = `# ${parsed.title}\n\n`;
        md += `> **Query:** ${parsed.query || 'N/A'}\n`;
        md += `> **Generated:** ${parsed.createdAt}\n\n`;
        md += `---\n\n`;

        // Content
        md += parsed.content + '\n\n';
        md += `---\n\n`;

        // Sources Used
        if (parsed.citations.length > 0) {
            md += `## Sources Used\n\n`;
            md += `| # | Source | Domain |\n`;
            md += `|---|--------|--------|\n`;
            for (const c of parsed.citations) {
                md += `| ${c.id} | [${c.text.substring(0, 50)}...](${c.url}) | ${c.domain} |\n`;
            }
            md += `\n`;
        }

        // Research Process (Agent Thoughts)
        if (parsed.reasoningSteps.length > 0) {
            md += `## Research Process\n\n`;
            for (const step of parsed.reasoningSteps) {
                md += `- **${step.phase}**: ${step.action.substring(0, 80)}...\n`;
            }
            md += `\n`;
        }

        // Research Flow Diagram
        if (parsed.researchFlow.length > 0) {
            md += `## Research Flow\n\n`;
            md += '```mermaid\n';
            md += 'graph TD\n';
            for (const node of parsed.researchFlow) {
                if (node.type === 'source') {
                    md += `    ${node.id}((${node.label}))\n`;
                } else if (node.type === 'query') {
                    md += `    ${node.id}[${node.label}]\n`;
                } else {
                    md += `    ${node.id}{${node.label}}\n`;
                }
                for (const link of node.links) {
                    md += `    ${node.id} --> ${link}\n`;
                }
            }
            md += '```\n';
        }

        return md;
    }
}

// Parser interfaces
export interface ParsedResearch {
    title: string;
    query: string;
    content: string;
    contentHtml: string;
    contentMarkdown: string;
    headings: string[];
    citations: Citation[];
    reasoningSteps: ReasoningStep[];
    researchFlow: FlowNode[];
    createdAt: string;
}

export interface Citation {
    id: number;
    text: string;
    url: string;
    domain: string;
    usedInSections: string[];
}

export interface ReasoningStep {
    phase: string;
    action: string;
    timestamp?: string;
}

export interface FlowNode {
    id: string;
    type: 'query' | 'source' | 'step' | 'conclusion';
    label: string;
    links: string[];
}
