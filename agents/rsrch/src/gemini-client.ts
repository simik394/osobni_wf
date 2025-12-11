
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

// === Parsed Research Types ===
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
    type: 'query' | 'source' | 'thought' | 'conclusion';
    label: string;
    links: string[]; // IDs of connected nodes
}

export interface ParsedResearch {
    title: string;
    query: string;
    content: string;           // Plain text
    contentHtml: string;       // HTML with structure
    contentMarkdown: string;   // Converted to markdown
    headings: string[];
    citations: Citation[];
    reasoningSteps: ReasoningStep[];
    researchFlow: FlowNode[];
    createdAt: string;
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

    /**
     * Rename a Google Doc by navigating to it and editing the title.
     * @param googleDocId The document ID (from URL)
     * @param newTitle The new title to set
     */
    async renameGoogleDoc(googleDocId: string, newTitle: string): Promise<boolean> {
        console.log(`[Gemini] Renaming Google Doc ${googleDocId} to "${newTitle}"`);

        try {
            // Navigate to the document
            const docUrl = `https://docs.google.com/document/d/${googleDocId}/edit`;
            await this.page.goto(docUrl, { waitUntil: 'domcontentloaded' });
            await this.page.waitForTimeout(2000);

            // The title is usually in an input or contenteditable div at the top
            // Selector for Google Docs title: input.docs-title-input or similar
            const titleSelector = 'input.docs-title-input';

            try {
                await this.page.waitForSelector(titleSelector, { state: 'visible', timeout: 10000 });

                // Click to focus
                await this.page.click(titleSelector);
                await this.page.waitForTimeout(300);

                // Select all and replace
                await this.page.keyboard.press('Control+a');
                await this.page.keyboard.type(newTitle, { delay: 30 });

                // Click outside to trigger auto-save (click on the document body)
                await this.page.click('.kix-appview-editor');
                await this.page.waitForTimeout(1500);

                console.log(`[Gemini] Document renamed successfully.`);
                return true;
            } catch (e) {
                console.warn('[Gemini] Title input not found with primary selector. Trying alternative...');

                // Alternative: sometimes title is in a different location
                const altTitleSelector = '[data-tooltip="Rename"]';
                const altTitle = this.page.locator(altTitleSelector).first();
                if (await altTitle.count() > 0) {
                    await altTitle.click();
                    await this.page.waitForTimeout(500);
                    await this.page.keyboard.press('Control+a');
                    await this.page.keyboard.type(newTitle, { delay: 30 });
                    await this.page.keyboard.press('Enter');
                    await this.page.waitForTimeout(1000);
                    console.log(`[Gemini] Document renamed via alternative selector.`);
                    return true;
                }

                console.error('[Gemini] Could not find title element to rename.');
                await this.dumpState('rename_doc_fail');
                return false;
            }
        } catch (e) {
            console.error('[Gemini] Failed to rename document:', e);
            return false;
        }
    }
    /**
     * Navigate to a specific research session by URL or session ID.
     * This ensures we're viewing the full research content.
     */
    async navigateToResearchSession(sessionIdOrUrl: string): Promise<boolean> {
        console.log(`[Gemini] Navigating to research session: ${sessionIdOrUrl}`);

        try {
            // Build full URL if just session ID
            let url = sessionIdOrUrl;
            if (!url.startsWith('http')) {
                url = `https://gemini.google.com/app/${sessionIdOrUrl}`;
            }

            await this.page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
            await this.page.waitForTimeout(3000);

            // Wait for content to load
            await this.page.waitForSelector('model-response, div.container', { timeout: 15000 });

            console.log('[Gemini] ✅ Navigated to research session');
            return true;
        } catch (e: any) {
            console.error('[Gemini] Failed to navigate to session:', e.message);
            return false;
        }
    }

    /**
     * Parse the current deep research session into a structured format.
     * Extracts content, citations, reasoning steps, and builds research flow.
     * 
     * @param sessionIdOrUrl - Optional session ID or URL. If provided, navigates to that session first.
     */
    async parseResearch(sessionIdOrUrl?: string): Promise<ParsedResearch | null> {
        console.log('[Gemini] Parsing research content...');

        try {
            // Navigate to session if URL provided
            if (sessionIdOrUrl) {
                const navigated = await this.navigateToResearchSession(sessionIdOrUrl);
                if (!navigated) {
                    console.warn('[Gemini] Could not navigate to session, parsing current page');
                }
            }

            // Wait for immersive panel to be present
            console.log('[Gemini] Waiting for research content...');
            await this.page.waitForSelector('model-response, div.container', { timeout: 10000 }).catch(() => { });

            // Check if immersive view is open (has more content)
            const immersiveOpen = await this.page.locator('.immersives-open').count() > 0;
            console.log(`[Gemini] Immersive view: ${immersiveOpen ? 'OPEN' : 'closed'}`);

            // Extract title from research panel or page
            const title = await this.extractTitle();
            console.log(`[Gemini] Title: ${title}`);

            // Extract query (original prompt)
            const query = await this.extractQuery();
            console.log(`[Gemini] Query: ${query?.substring(0, 50)}...`);

            // Extract main content - try multiple containers to get most content
            const { content, contentHtml, headings } = await this.extractContent();
            console.log(`[Gemini] Extracted ${headings.length} headings, ${content.length} chars`);

            // Extract citations
            const citations = await this.extractCitations();
            console.log(`[Gemini] Found ${citations.length} citations`);

            // Extract reasoning steps from chat history
            const reasoningSteps = await this.extractReasoningSteps();
            console.log(`[Gemini] Found ${reasoningSteps.length} reasoning steps`);

            // Build research flow diagram
            const researchFlow = this.buildResearchFlow(citations, reasoningSteps, query || '');

            // Convert to markdown
            const contentMarkdown = this.htmlToMarkdown(contentHtml, citations);

            const parsed: ParsedResearch = {
                title: title || 'Untitled Research',
                query: query || '',
                content,
                contentHtml,
                contentMarkdown,
                headings,
                citations,
                reasoningSteps,
                researchFlow,
                createdAt: new Date().toISOString()
            };

            return parsed;

        } catch (e: any) {
            console.error('[Gemini] Failed to parse research:', e);
            await this.dumpState('parse_research_fail');
            return null;
        }
    }

    /**
     * Extract the title from the research panel
     * 
     * Skip generic headings like "Chaty", "Konverzace" and find actual research title.
     */
    private async extractTitle(): Promise<string | null> {
        // Generic headings to skip
        const skipTitles = ['chaty', 'konverzace', 'konverzace s gemini', 'gemini', 'conversations'];

        // Look for all headings in content area
        const headings = this.page.locator('model-response h1, model-response h2, div.container h1, div.container h2');
        const count = await headings.count();

        for (let i = 0; i < count; i++) {
            const text = await headings.nth(i).textContent();
            if (text) {
                const trimmed = text.trim();
                const lower = trimmed.toLowerCase();

                // Skip generic titles
                if (skipTitles.some(skip => lower === skip || lower.startsWith(skip))) continue;

                // Skip very short titles (likely navigation)
                if (trimmed.length < 10) continue;

                return trimmed;
            }
        }

        // Fallback: try conversation title from sidebar
        const convTitle = this.page.locator('.conversation-title').first();
        if (await convTitle.count() > 0) {
            const text = await convTitle.textContent();
            if (text && text.trim().length > 5) {
                return text.trim();
            }
        }

        return null;
    }

    /**
     * Extract the original query/prompt
     */
    private async extractQuery(): Promise<string | null> {
        // Look in chat history for user message
        const userMessages = this.page.locator('.user-message, [class*="user-query"], .query-text');
        if (await userMessages.count() > 0) {
            const text = await userMessages.first().textContent();
            return text?.trim() || null;
        }

        // Try to find prompt in another location
        const promptEl = this.page.locator('[data-query], [aria-label*="query"]').first();
        if (await promptEl.count() > 0) {
            return await promptEl.textContent();
        }

        return null;
    }

    /**
     * Extract main content from the research panel.
     * 
     * Aggregates content from all model-response elements to capture full research.
     */
    private async extractContent(): Promise<{ content: string, contentHtml: string, headings: string[] }> {
        let allContent = '';
        let allHtml = '';
        const headings: string[] = [];

        // Try to get content from all model-response elements
        const modelResponses = this.page.locator('model-response');
        const responseCount = await modelResponses.count();
        console.log(`[Gemini] Found ${responseCount} model-response elements`);

        if (responseCount > 0) {
            for (let i = 0; i < responseCount; i++) {
                try {
                    const el = modelResponses.nth(i);
                    const html = await el.evaluate(node => node.innerHTML);
                    const text = await el.evaluate(node => node.textContent || '');
                    allHtml += html + '\n';
                    allContent += text + '\n';
                } catch (e) {
                    // Skip inaccessible elements
                }
            }
        }

        // Fallback: try container elements if no model-response
        if (allContent.length < 1000) {
            const containers = this.page.locator('div.container.hide-from-message-actions');
            const containerCount = await containers.count();

            for (let i = 0; i < containerCount; i++) {
                try {
                    const el = containers.nth(i);
                    const text = await el.evaluate(node => node.textContent || '');
                    const html = await el.evaluate(node => node.innerHTML);
                    allContent += text + '\n';
                    allHtml += html + '\n';
                } catch (e) {
                    // Skip
                }
            }
        }

        // Extract headings
        const headingEls = this.page.locator('model-response h1, model-response h2, model-response h3, div.container h1, div.container h2, div.container h3');
        const headingCount = await headingEls.count();
        for (let i = 0; i < Math.min(headingCount, 50); i++) {
            const text = await headingEls.nth(i).textContent();
            if (text) {
                const trimmed = text.trim();
                if (trimmed.length > 5 && !headings.includes(trimmed)) {
                    headings.push(trimmed);
                }
            }
        }

        return {
            content: allContent.trim(),
            contentHtml: allHtml.trim(),
            headings
        };
    }

    /**
     * Extract citations from inline links in the content
     * 
     * DOM research showed: Source URLs are regular <a href> elements,
     * NOT hidden behind button clicks. Filter out Google/internal URLs.
     */
    async extractCitations(): Promise<Citation[]> {
        const citations: Citation[] = [];

        // Domains to exclude (internal/boilerplate)
        const excludeDomains = [
            'google.com',
            'gstatic.com',
            'accounts.google.com',
            'gemini.google.com',
            'support.google.com',
            'www.google.com',
            'googletagmanager.com'
        ];

        // Look for all external links in content containers
        const links = this.page.locator('model-response a[href^="http"], div.container a[href^="http"]');
        const linkCount = await links.count();
        console.log(`[Gemini] Found ${linkCount} links in content`);

        for (let i = 0; i < Math.min(linkCount, 100); i++) {
            try {
                const link = links.nth(i);
                const href = await link.getAttribute('href');
                const text = await link.textContent();

                if (!href) continue;

                // Parse URL and check domain
                const url = new URL(href);
                const domain = url.hostname.replace('www.', '');

                // Skip if excluded domain
                if (excludeDomains.some(d => domain.includes(d))) continue;

                // Skip if already have this URL
                if (citations.some(c => c.url === href)) continue;

                citations.push({
                    id: citations.length + 1,
                    text: text?.trim() || domain,
                    url: href,
                    domain: domain,
                    usedInSections: []
                });
            } catch (e) {
                // Skip invalid URLs
            }
        }

        console.log(`[Gemini] Extracted ${citations.length} unique citations`);
        return citations;
    }

    /**
     * Extract reasoning steps from chat history
     */
    async extractReasoningSteps(): Promise<ReasoningStep[]> {
        const steps: ReasoningStep[] = [];

        // Look for research status messages
        const statusMessages = this.page.locator(
            '[class*="research-status"], [class*="thinking"], .system-message'
        );

        const count = await statusMessages.count();
        for (let i = 0; i < count; i++) {
            const text = await statusMessages.nth(i).textContent();
            if (text) {
                const trimmed = text.trim();
                if (trimmed.includes('výzkum') || trimmed.includes('research') ||
                    trimmed.includes('Searching') || trimmed.includes('Analyzing')) {
                    steps.push({
                        phase: `Step ${i + 1}`,
                        action: trimmed.substring(0, 100)
                    });
                }
            }
        }

        // Look for specific markers in chat
        const chatHistory = this.page.locator('[data-test-id="chat-history-container"]').first();
        if (await chatHistory.count() > 0) {
            try {
                const historyText = await chatHistory.textContent();

                // Extract research phases
                if (historyText?.includes('Zahájit výzkum') || historyText?.includes('Start research')) {
                    steps.push({ phase: 'Start', action: 'Research initiated' });
                }
                if (historyText?.includes('Dokončeno') || historyText?.includes('Completed')) {
                    steps.push({ phase: 'Complete', action: 'Research completed' });
                }
            } catch (e) {
                // Ignore if can't get text
            }
        }

        return steps;
    }

    /**
     * Build research flow diagram data
     */
    private buildResearchFlow(citations: Citation[], steps: ReasoningStep[], query: string): FlowNode[] {
        const nodes: FlowNode[] = [];

        // Query node
        nodes.push({
            id: 'query',
            type: 'query',
            label: query.substring(0, 50) + (query.length > 50 ? '...' : ''),
            links: []
        });

        // Add source nodes from citations
        citations.slice(0, 10).forEach((c, i) => {
            nodes.push({
                id: `source_${i}`,
                type: 'source',
                label: c.domain || c.text.substring(0, 30),
                links: ['query']
            });
        });

        // Add thought nodes from reasoning steps
        steps.forEach((s, i) => {
            nodes.push({
                id: `thought_${i}`,
                type: 'thought',
                label: s.action.substring(0, 40),
                links: i === 0 ? ['query'] : [`thought_${i - 1}`]
            });
        });

        // Conclusion node
        if (nodes.length > 1) {
            nodes.push({
                id: 'conclusion',
                type: 'conclusion',
                label: 'Research Complete',
                links: [nodes[nodes.length - 1].id]
            });
        }

        return nodes;
    }

    /**
     * Convert HTML content to Markdown with citation references
     */
    private htmlToMarkdown(html: string, citations: Citation[]): string {
        let md = html;

        // Convert headings
        md = md.replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n\n');
        md = md.replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n\n');
        md = md.replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n\n');
        md = md.replace(/<h4[^>]*>(.*?)<\/h4>/gi, '#### $1\n\n');

        // Convert paragraphs
        md = md.replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n');

        // Convert lists
        md = md.replace(/<ul[^>]*>/gi, '\n');
        md = md.replace(/<\/ul>/gi, '\n');
        md = md.replace(/<ol[^>]*>/gi, '\n');
        md = md.replace(/<\/ol>/gi, '\n');
        md = md.replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n');

        // Convert links
        md = md.replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)');

        // Convert bold/italic
        md = md.replace(/<(strong|b)[^>]*>(.*?)<\/(strong|b)>/gi, '**$2**');
        md = md.replace(/<(em|i)[^>]*>(.*?)<\/(em|i)>/gi, '*$2*');

        // Remove remaining HTML tags
        md = md.replace(/<[^>]+>/g, '');

        // Clean up whitespace
        md = md.replace(/\n{3,}/g, '\n\n');
        md = md.trim();

        return md;
    }

    /**
     * Export parsed research to a Markdown file
     */
    exportToMarkdown(parsed: ParsedResearch): string {
        let md = `# ${parsed.title}\n\n`;
        md += `> **Query:** ${parsed.query}\n`;
        md += `> **Generated:** ${parsed.createdAt}\n\n`;
        md += `---\n\n`;

        // Main content
        md += parsed.contentMarkdown;
        md += '\n\n---\n\n';

        // Sources section
        if (parsed.citations.length > 0) {
            md += `## Sources Used\n\n`;
            md += `| # | Source | Domain |\n`;
            md += `|---|--------|--------|\n`;
            parsed.citations.forEach(c => {
                md += `| ${c.id} | [${c.text}](${c.url}) | ${c.domain} |\n`;
            });
            md += '\n';
        }

        // Reasoning section
        if (parsed.reasoningSteps.length > 0) {
            md += `## Research Process\n\n`;
            parsed.reasoningSteps.forEach(s => {
                md += `- **${s.phase}**: ${s.action}\n`;
            });
            md += '\n';
        }

        // Research flow diagram
        if (parsed.researchFlow.length > 0) {
            md += `## Research Flow\n\n`;
            md += '```mermaid\ngraph TD\n';
            parsed.researchFlow.forEach(node => {
                const shape = node.type === 'query' ? `[${node.label}]` :
                    node.type === 'source' ? `((${node.label}))` :
                        node.type === 'conclusion' ? `[/${node.label}/]` :
                            `{${node.label}}`;
                md += `    ${node.id}${shape}\n`;
                node.links.forEach(link => {
                    md += `    ${link} --> ${node.id}\n`;
                });
            });
            md += '```\n';
        }

        return md;
    }

    /**
     * Create a Google Doc with the parsed research content.
     * 
     * Uses browser automation to:
     * 1. Navigate to Google Docs
     * 2. Create a new blank document
     * 3. Insert the markdown content
     * 4. Rename the document
     * 
     * @returns Object with docId and docUrl, or null on failure
     */
    async createGoogleDoc(parsed: ParsedResearch, customTitle?: string): Promise<{ docId: string, docUrl: string } | null> {
        console.log('[Gemini] Creating Google Doc...');

        try {
            const title = customTitle || parsed.title;

            // Navigate to Google Docs create page
            await this.page.goto('https://docs.google.com/document/create', {
                waitUntil: 'networkidle',
                timeout: 60000
            });
            await this.page.waitForTimeout(3000);

            // Wait for document to be ready
            await this.page.waitForSelector('.docs-title-input, [aria-label*="Document title"]', { timeout: 15000 });

            // Get the document URL (contains the doc ID)
            const docUrl = this.page.url();
            const docIdMatch = docUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
            const docId = docIdMatch ? docIdMatch[1] : '';
            console.log(`[Gemini] Created doc: ${docId}`);

            // Rename the document
            const titleInput = this.page.locator('.docs-title-input, input[aria-label*="Document title"]').first();
            if (await titleInput.count() > 0) {
                await titleInput.click();
                await this.page.waitForTimeout(500);
                await titleInput.fill(title);
                await this.page.keyboard.press('Enter');
                await this.page.waitForTimeout(1000);
            }

            // Generate markdown content
            const markdown = this.exportToMarkdown(parsed);

            // Focus on document body
            const docBody = this.page.locator('.kix-appview-editor, [contenteditable="true"]').first();
            if (await docBody.count() > 0) {
                await docBody.click();
                await this.page.waitForTimeout(500);

                // Type the content (Docs will auto-format some markdown)
                // Note: For large content, we split into chunks
                const chunks = this.splitIntoChunks(markdown, 5000);
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

    /**
     * Split text into chunks for typing
     */
    private splitIntoChunks(text: string, chunkSize: number): string[] {
        const chunks: string[] = [];
        for (let i = 0; i < text.length; i += chunkSize) {
            chunks.push(text.slice(i, i + chunkSize));
        }
        return chunks;
    }
}
