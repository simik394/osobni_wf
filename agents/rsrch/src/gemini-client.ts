
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
}
