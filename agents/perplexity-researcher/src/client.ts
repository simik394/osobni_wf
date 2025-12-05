import { chromium } from 'playwright-extra';
import type { BrowserContext, Page } from 'playwright';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { config } from './config';
import * as fs from 'fs';
import * as path from 'path';

// Add stealth plugin
chromium.use(StealthPlugin());

interface Session {
    id: string;
    name?: string;
    page: Page;
    createdAt: number;
}

export class PerplexityClient {
    private browser: any = null;
    private context: BrowserContext | null = null;
    private sessions: Session[] = [];
    private isInitialized = false;

    async init() {
        if (this.isInitialized) {
            console.log('Client already initialized');
            return;
        }

        if (process.env.BROWSER_WS_ENDPOINT) {
            // Remote/Docker mode:
            // We can't use launchPersistentContext over WS connect easily.
            // But if we are in Docker using the 'chromium' service, we can't 'connect' and share the persistent disk easily unless it is mounted.
            // Actually, the original 'client.ts' used 'launchPersistentContext' locally.
            // If running in Docker, we typically skip the 'browser service' and just run Chromium inside the container if we want persistent context on disk.

            // Wait, the original code had NO browser service concept?
            // "Connect to browser service..." was introduced by me.
            // If we revert to "old way", we probably run browser directly.

            console.log(`Connecting to browser service at ${config.browserWsEndpoint}...`);
            this.browser = await chromium.connect(config.browserWsEndpoint);
            this.context = await this.browser.newContext(); // This won't have the persistent state unless we load storageState

            // Revert: If we want to support the OLD way, we should support LOCAL launch primarily.
        } else {
            // Local mode
            console.log('Launching browser with saved profile...');
            // Ensure dir exists
            if (!fs.existsSync(config.auth.userDataDir)) {
                fs.mkdirSync(config.auth.userDataDir, { recursive: true });
            }

            this.context = await chromium.launchPersistentContext(config.auth.userDataDir, {
                headless: process.env.HEADLESS !== 'false', // Default to true (headless) now that we are auth'd
                channel: 'chromium'
            });
            this.browser = this.context; // persistent context objects act as browser too for closing
        }

        // Note: connecting to existing context vs creating new one
        console.log('Browser ready');
        this.isInitialized = true;
    }

    private async createSession(name?: string): Promise<Session> {
        if (!this.context) throw new Error('Context not initialized');

        const page = await this.context.newPage();
        const id = Math.random().toString(36).substring(2, 9);
        const session: Session = {
            id,
            name,
            page,
            createdAt: Date.now()
        };
        this.sessions.push(session);
        console.log(`Created new session: ${id} ${name ? `(${name})` : ''}`);

        // Cleanup old sessions (keep last 5)
        if (this.sessions.length > 5) {
            const oldSession = this.sessions.shift();
            if (oldSession) {
                console.log(`Closing old session: ${oldSession.id}`);
                await oldSession.page.close().catch(e => console.error('Error closing old page:', e));
            }
        }

        return session;
    }

    private getSession(selector: string = 'new'): Session | undefined {
        if (selector === 'new') return undefined;

        if (selector === 'latest' || selector === 'last') {
            return this.sessions[this.sessions.length - 1];
        }

        // Try by ID
        const byId = this.sessions.find(s => s.id === selector);
        if (byId) return byId;

        // Try by Name
        const byName = this.sessions.find(s => s.name === selector);
        if (byName) return byName;

        // Try by Index
        const index = parseInt(selector);
        if (!isNaN(index) && index >= 0 && index < this.sessions.length) {
            return this.sessions[index];
        }

        return undefined;
    }

    async query(queryText: string, options: { session?: string, name?: string } = {}): Promise<{ query: string; answer: string | null; timestamp: string; url: string }> {
        if (!this.isInitialized || !this.context) {
            throw new Error('Client not initialized. Call init() first.');
        }

        console.log(`Running query: "${queryText}"`);

        let session: Session;
        const target = options.session || 'new';
        const existingSession = this.getSession(target);

        if (existingSession) {
            console.log(`Using existing session: ${existingSession.id} ${existingSession.name ? `(${existingSession.name})` : ''}`);
            session = existingSession;
            // Bring to front
            await session.page.bringToFront();
        } else {
            if (target !== 'new' && target !== 'latest') {
                console.log(`Session '${target}' not found. Creating new one.`);
            }
            session = await this.createSession(options.name || (target !== 'new' && target !== 'latest' ? target : undefined));
        }

        const page = session.page;

        try {
            // Only navigate home if it's a new session or we want to start fresh? 
            // Actually, for follow-ups we might want to stay on the same page if it's already there?
            // But the current logic assumes we type into the main input. 
            // Perplexity handles follow-ups in the same thread differently.
            // For now, let's assume we always go to the main URL to ensure we find the input.
            // Wait, if we are in a thread, the input selector might be different (bottom of page).
            // But config.url is the home page.

            // If we are reusing a session, we might be on a result page.
            // If we go to config.url, we start a NEW thread.
            // If the user wants to follow up, they probably want to stay on the current page.

            // Let's check if we are already on a perplexity page.
            const currentUrl = page.url();
            if (currentUrl.includes('perplexity.ai/search/')) {
                console.log('Already on a search page. Attempting to find follow-up input...');
                // We need a selector for follow-up input.
                // Usually it's the same textarea but at the bottom.
                // Let's try to find the input without navigating.
            } else {
                await page.goto(config.url);
            }

            // Wait for input
            console.log('Looking for query input...');

            const selectors = Array.isArray(config.selectors.queryInput)
                ? config.selectors.queryInput
                : [config.selectors.queryInput];

            let inputSelector = '';
            for (const selector of selectors) {
                try {
                    await page.waitForSelector(selector, { timeout: 2000 });
                    inputSelector = selector;
                    console.log(`Found input with selector: ${selector}`);
                    break;
                } catch (e) {
                    // Continue to next selector
                }
            }

            if (!inputSelector) {
                // If we are on a result page, maybe the selector is different?
                // For now, if we fail to find input, and we didn't navigate, maybe we should navigate home and try again?
                if (currentUrl.includes('perplexity.ai/search/')) {
                    console.log('Could not find input on search page. Navigating to home...');
                    await page.goto(config.url);
                    // Retry finding selector
                    for (const selector of selectors) {
                        try {
                            await page.waitForSelector(selector, { timeout: 2000 });
                            inputSelector = selector;
                            break;
                        } catch (e) { }
                    }
                }
            }

            if (!inputSelector) {
                throw new Error('Could not find query input field with any known selector.');
            }

            console.log('Typing query...');
            await page.fill(inputSelector, queryText);

            // Submit query
            await page.keyboard.press('Enter');
            console.log('Query submitted. Waiting for answer...');

            // Wait for answer container to appear
            // Note: On a follow-up, the answer container might already exist from previous turn.
            // We need to wait for a NEW answer or the "Stop generating" button to appear and then disappear.

            // Wait for answer generation to complete
            console.log('Waiting for answer generation to complete...');

            // Give it a moment to start generating
            await page.waitForTimeout(1000);

            try {
                // If "Stop generating" button exists, wait for it to detach
                const stopButton = await page.$('button:has-text("Stop generating")');
                if (stopButton) {
                    console.log('Found "Stop generating" button, waiting for it to disappear...');
                    await page.waitForSelector('button:has-text("Stop generating")', { state: 'detached', timeout: 60000 });
                    console.log('Generation complete (button disappeared).');
                } else {
                    // Fallback: wait a bit and check stability
                    console.log('No "Stop generating" button found, using stability check...');
                    let lastText = '';
                    let stableCount = 0;
                    const maxRetries = 60;

                    for (let i = 0; i < maxRetries; i++) {
                        // We need to get the LAST answer container if there are multiple?
                        // config.selectors.answerContainer usually targets the main answer.
                        // In a thread, there are multiple answers.
                        // We should probably grab the text of the whole thread or the last message.
                        // For simplicity, let's stick to the current selector logic but be aware it might need tuning for threads.

                        const currentText = await page.textContent(config.selectors.answerContainer);
                        if (currentText && currentText === lastText && currentText.length > 50) {
                            stableCount++;
                            if (stableCount >= 2) {
                                console.log('Answer stabilized.');
                                break;
                            }
                        } else {
                            stableCount = 0;
                            lastText = currentText || '';
                        }
                        await page.waitForTimeout(500);
                    }
                }
            } catch (e) {
                console.log('Error during completion check, assuming done:', e);
            }

            // TODO: Improve answer extraction for threads (get the last answer)
            const answer = await page.textContent(config.selectors.answerContainer);

            const result = {
                query: queryText,
                answer: answer,
                timestamp: new Date().toISOString(),
                url: page.url()
            };

            // Save result
            const filename = `result-${Date.now()}.json`;
            const filepath = path.join(config.paths.resultsDir, filename);

            if (!fs.existsSync(config.paths.resultsDir)) {
                fs.mkdirSync(config.paths.resultsDir, { recursive: true });
            }

            try {
                fs.writeFileSync(filepath, JSON.stringify(result, null, 2));
                console.log(`Result saved to ${filepath}`);
            } catch (saveError) {
                console.error('Error saving file (permission issue):', saveError);
            }

            return result;

        } catch (error) {
            console.error('Query execution failed:', error);
            // Don't close the page on error, let the user see it in VNC
            throw error;
        }
    }

    async saveAuth() {
        if (!this.context) return;
        console.log(`Saving auth state to ${config.auth.authFile}...`);
        await this.context.storageState({ path: config.auth.authFile });
        console.log('Auth state saved.');
    }

    async close() {
        // Close all pages
        for (const session of this.sessions) {
            await session.page.close().catch(() => { });
        }
        this.sessions = [];

        if (this.context) {
            await this.context.close();
            this.context = null;
        }
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
        }
        this.isInitialized = false;
        console.log('Browser closed');
    }
}
