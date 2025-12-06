import { chromium } from 'playwright-extra';
import { NotebookLMClient } from './notebooklm-client';
import { GeminiClient } from './gemini-client';
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
            console.log(`Connecting to browser service at ${config.browserWsEndpoint}...`);
            this.browser = await chromium.connect(config.browserWsEndpoint);

            // Load storage state if exists
            let storageState = undefined;
            if (fs.existsSync(config.auth.authFile)) {
                console.log(`Loading auth state from ${config.auth.authFile}`);
                try {
                    const authContent = fs.readFileSync(config.auth.authFile, 'utf-8');
                    storageState = JSON.parse(authContent);
                    console.log('[Client] Auth state loaded into memory.');
                } catch (e: any) {
                    console.error('[Client] Failed to parse auth file:', e);
                }
            }

            this.context = await this.browser.newContext({
                storageState: storageState,
                viewport: { width: 1280, height: 1024 } // specific viewport for VNC
            });

            // Add anti-detection scripts for every new page
            if (this.context) {
                await this.context.addInitScript(() => {
                    // Override the `navigator.webdriver` property
                    Object.defineProperty(navigator, 'webdriver', {
                        get: () => undefined,
                    });

                    // Mock the `chrome` object
                    (window as any).chrome = {
                        runtime: {},
                    };

                    // Override permissions
                    const originalQuery = window.navigator.permissions.query;
                    window.navigator.permissions.query = (parameters: any) => (
                        parameters.name === 'notifications' ?
                            Promise.resolve({ state: Notification.permission } as PermissionStatus) :
                            originalQuery(parameters)
                    );

                    // Add realistic plugins
                    Object.defineProperty(navigator, 'plugins', {
                        get: () => [1, 2, 3, 4, 5],
                    });

                    // Add realistic languages
                    Object.defineProperty(navigator, 'languages', {
                        get: () => ['en-US', 'en'],
                    });
                });
            }

        } else if (process.env.REMOTE_DEBUGGING_PORT) {
            console.log(`Connecting to local browser on port ${process.env.REMOTE_DEBUGGING_PORT}...`);
            this.browser = await chromium.connectOverCDP(`http://localhost:${process.env.REMOTE_DEBUGGING_PORT}`);
            const contexts = this.browser.contexts();
            if (contexts.length > 0) {
                this.context = contexts[0];
                console.log(`Attached to existing context with ${contexts.length} contexts.`);
            } else {
                console.log('No direct contexts found. Trying to derive from pages...');
                const pages = this.browser.pages ? this.browser.pages() : []; // access pages synchronously if possible or await if needed in newer playwright? connectOverCDP returns Browser which has contexts.
                // Wait, Browser.pages() is not a standard method on Browser type immediately?
                // It's usually accessible via contexts.
                // But connectOverCDP returns a Browser instance.
                // Let's try creating a new page to get the default context.
                try {
                    const page = await this.browser.newPage();
                    this.context = page.context();
                    console.log('Acquired context via new page creation.');
                } catch (e: any) {
                    throw new Error(`Could not acquire context from CDP browser: ${e.message}`);
                }
            }

        } else {
            // Local mode
            console.log('Launching browser (Persistent Local Mode)...');
            // Ensure dir exists
            if (!fs.existsSync(config.auth.userDataDir)) {
                fs.mkdirSync(config.auth.userDataDir, { recursive: true });
            }

            const headless = process.env.HEADLESS === 'true';
            console.log(`Headless: ${headless}`);

            this.context = await chromium.launchPersistentContext(config.auth.userDataDir, {
                headless: headless,
                channel: 'chromium',
                args: ['--disable-blink-features=AutomationControlled', '--start-maximized', '--no-sandbox'],
                ignoreDefaultArgs: ['--enable-automation'],
                viewport: { width: 1280, height: 1024 },
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            });
            this.browser = this.context;
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
                await oldSession.page.close().catch((e: any) => console.error('Error closing old page:', e));
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

    async openPage(url: string): Promise<void> {
        if (!this.isInitialized || !this.context) {
            throw new Error('Client not initialized. Call init() first.');
        }
        console.log(`Opening page: ${url}`);
        const page = await this.context.newPage();
        await page.goto(url);
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
            } catch (e: any) {
                console.error("Error creating session in openPage:", e);
                throw e;
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
            } catch (e: any) {
                console.error(`Error saving page dump: ${e.message}`);
            }

            return result;

        } catch (error: any) {
            console.error('Unexpected error in audio generation:', error);
            // Try to capture state on failure
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
    async createNotebookClient(): Promise<NotebookLMClient> {
        if (!this.context) throw new Error('Context not initialized');
        const page = await this.context.newPage();
        return new NotebookLMClient(page);
    }

    async createGeminiClient(): Promise<GeminiClient> {
        if (!this.context) throw new Error('Context not initialized');
        const page = await this.context.newPage();
        return new GeminiClient(page);
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
