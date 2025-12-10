import { chromium } from 'playwright-extra';
import { NotebookLMClient } from './notebooklm-client';
import { GeminiClient } from './gemini-client';
import { chromium as playwrightChromium, BrowserContext, Page, Browser } from 'playwright';
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

interface Source {
    index: number;
    url: string;
    title: string;
}

export interface QueryResponse {
    query: string;
    answer: string;
    markdown?: string;
    sources?: Source[];
    timestamp: string;
    url: string;
}

export class PerplexityClient {
    private browser: any = null;
    private page: Page | null = null;
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
                console.log(`Loading auth state from ${config.auth.authFile} `);
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
                        get: () => false, // Better to return false than undefined for some checks
                    });

                    // Mock the `chrome` object if not present
                    if (!(window as any).chrome) {
                        (window as any).chrome = {
                            runtime: {},
                            app: {},
                            csi: () => { },
                            loadTimes: () => { }
                        };
                    }

                    // Override permissions to always allow notifications (common in real browsers)
                    const originalQuery = window.navigator.permissions.query;
                    window.navigator.permissions.query = (parameters: any) => (
                        parameters.name === 'notifications' ?
                            Promise.resolve({ state: 'granted' } as PermissionStatus) :
                            originalQuery(parameters)
                    );

                    // Add realistic plugins (if empty)
                    if (navigator.plugins.length === 0) {
                        Object.defineProperty(navigator, 'plugins', {
                            get: () => [1, 2, 3, 4, 5],
                        });
                    }

                    // Add realistic languages if missing
                    if (navigator.languages.length === 0) {
                        Object.defineProperty(navigator, 'languages', {
                            get: () => ['en-US', 'en'],
                        });
                    }
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

            // Default to headless unless:
            // 1. HEADLESS env var explicitly set to 'false', OR
            // 2. --headed flag is passed in command line args
            const hasHeadedFlag = process.argv.includes('--headed');
            const headlessEnv = process.env.HEADLESS;
            const headless = headlessEnv === 'false' ? false : (hasHeadedFlag ? false : true);
            console.log(`Headless: ${headless}${hasHeadedFlag ? ' (--headed flag detected)' : ''}`);

            this.context = await chromium.launchPersistentContext(config.auth.userDataDir, {
                headless: headless, // Playwright uses 'new' headless by default in recent versions
                channel: 'chromium',
                args: [
                    '--disable-blink-features=AutomationControlled',
                    '--start-maximized',
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-infobars',
                    '--window-size=1920,1080',
                    '--disable-web-security',
                    '--disable-features=IsolateOrigins,site-per-process'
                ],
                ignoreDefaultArgs: ['--enable-automation'],
                viewport: { width: 1920, height: 1080 },
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
            });
            this.browser = this.context;
            this.page = this.context.pages()[0] || await this.context.newPage();
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

    // New helper to create session exposed for external use if needed, but confusing with standard flow.
    // Instead we stick to standard query flow or explicit session tool calls (not here).
    // Let's refactor query to use logic similar to getSession but also create if missing.
    private async _getSession(name?: string, id?: string): Promise<Session> {
        if (id && this.getSession(id)) {
            return this.getSession(id)!;
        }
        if (name && this.getSession(name)) {
            return this.getSession(name)!;
        }
        // else create new
        return this.createSession(name);
    }

    async openPage(url: string): Promise<void> {
        if (!this.isInitialized || !this.context) {
            throw new Error('Client not initialized. Call init() first.');
        }
        console.log(`Opening page: ${url}`);
        const page = await this.context.newPage();
        await page.goto(url);
    }

    async query(queryText: string, options: { sessionName?: string, sessionId?: string } = {}): Promise<QueryResponse> {
        if (!this.isInitialized || !this.context) {
            throw new Error('Client not initialized. Call init() first.');
        }

        console.log(`Running query: "${queryText}"`);

        // Resolve session
        let session: Session;
        if (options.sessionId && this.getSession(options.sessionId)) {
            session = this.getSession(options.sessionId)!;
            console.log(`Using existing session by ID: ${session.id}`);
            await session.page.bringToFront();
        } else if (options.sessionName && this.getSession(options.sessionName)) {
            session = this.getSession(options.sessionName)!;
            console.log(`Using existing session by Name: ${session.name}`);
            await session.page.bringToFront();
        } else {
            console.log(`Creating new session${options.sessionName ? ` '${options.sessionName}'` : ''}...`);
            session = await this.createSession(options.sessionName);
        }

        const { page } = session;
        // Fix: Use imported 'config' object, not 'this.config'
        // The original code had `const config = this.config;` which was a syntax error.
        // The `config` object is imported at the top of the file.
        // No change needed here as `config` is already in scope.

        try {
            // Check if we are already on a search page
            const currentUrl = page.url();
            if (currentUrl.includes('perplexity.ai/search/')) {
                console.log('Already on a search page. Monitoring thread state...');
            } else {
                await page.goto(config.url);
            }

            // Wait for input
            console.log('Looking for query input...');

            const selectors = Array.isArray(config.selectors.queryInput)
                ? [...config.selectors.queryInput]
                : [config.selectors.queryInput];

            if (config.selectors.followUpInput) {
                selectors.push(config.selectors.followUpInput);
            }
            // Add fallback selectors
            selectors.push('textarea[placeholder*="Ask"]', 'div[contenteditable="true"]');

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
                throw new Error('Could not find query input field with known selectors.');
            }

            // Capture initial answer count BEFORE submitting
            const initialAnswerCount = await page.locator(config.selectors.answerContainer).count();
            console.log(`Initial answer count: ${initialAnswerCount}`);

            console.log('Typing query...');
            await page.fill(inputSelector, queryText);

            // Submit query
            await page.keyboard.press('Enter');
            console.log('Query submitted. Waiting for new answer...');

            // Wait for answer generation
            let newAnswerIndex = initialAnswerCount;
            let pollingAttempts = 0;
            const maxPollingAttempts = 60; // 30 seconds approx

            // Wait for the NEW container to appear
            while (pollingAttempts < maxPollingAttempts) {
                const currentCount = await page.locator(config.selectors.answerContainer).count();
                if (currentCount > initialAnswerCount) {
                    newAnswerIndex = currentCount - 1; // 0-based index of the last one
                    console.log(`New answer container detected at index ${newAnswerIndex} (Total: ${currentCount})`);
                    break;
                }
                await page.waitForTimeout(500);
                pollingAttempts++;
            }

            if (pollingAttempts >= maxPollingAttempts) {
                console.warn("Timed out waiting for new answer container count to increase. Checking current count...");
                const currentCount = await page.locator(config.selectors.answerContainer).count();
                if (currentCount > 0) {
                    newAnswerIndex = currentCount - 1;
                    console.log(`Fallback: Using last available answer container at index ${newAnswerIndex}`);
                } else {
                    throw new Error("No answer containers found after query submission.");
                }
            }

            // Stability check logic...
            console.log(`Monitoring stability of answer at index ${newAnswerIndex}...`);
            const answerLocator = page.locator(config.selectors.answerContainer).nth(newAnswerIndex);

            let lastText = '';
            let stableCount = 0;
            const stabilityThreshold = 5;

            for (let i = 0; i < 240; i++) {
                const stopButton = await page.$('button:has-text("Stop generating")');
                if (!stopButton && stableCount > 2) {
                    // faster exit check
                }

                const currentText = await answerLocator.innerText().catch(() => '');

                if (currentText && currentText.length > 0) {
                    if (currentText === lastText) {
                        stableCount++;
                    } else {
                        stableCount = 0;
                        lastText = currentText;
                        process.stdout.write('.');
                    }
                }

                if (stableCount >= stabilityThreshold) {
                    console.log('\nAnswer stabilized.');
                    break;
                }

                await page.waitForTimeout(500);
            }

            // --- Enhanced Extraction ---

            // 1. Expand Thoughts if present (Multilingual support: English, Czech, etc.)
            // Logic: Find the toggle acting as a header for reasoning steps.
            console.log('Checking for thoughts toggle...');

            // We search for a clickable div containing relevant text keywords or the specific icon pattern.
            // Based on DOM analysis, it's a div.cursor-pointer containing text like "4 steps completed".
            const togglePattern = /(\d+\s+)?(steps?|kroky?|fáze|thoughts?).*(completed|dokončeny?|generated)|(view|zobrazit).*(detailed|detailní).*(steps|kroky)|reasoning process/i;

            // We target the clickable container directly
            const thoughtsToggle = page.locator('div.cursor-pointer')
                .filter({ hasText: togglePattern })
                .first();

            const isVisible = await thoughtsToggle.isVisible().catch(() => false);
            if (isVisible) {
                console.log('Thoughts toggle found, clicking...');
                await thoughtsToggle.click();
                await page.waitForTimeout(1000); // Wait for toggle animation
            } else {
                console.log('No thoughts toggle found (or already expanded/not present).');
            }


            // 2. Extract Data
            const data = await page.evaluate(([index, answerSelector]: any) => {
                const containers = document.querySelectorAll(answerSelector);
                // We typically want the requested index, but sticking to logic.
                const container = containers[index];
                if (!container) return { answer: '', html: '', sources: [] as { index: number; url: string; title: string }[], thoughts: [] as string[] };

                // Clone to avoid mutating visible page
                const clone = container.cloneNode(true) as HTMLElement;

                const sources: { index: number; url: string; title: string }[] = [];
                const thoughts: string[] = [];

                // 1. Extract Sources (Robust)
                // Find citations in CLONE and replace with [^n]
                const specificCitations = clone.querySelectorAll('.citation a, a[href*="perplexity.ai/search"]');

                specificCitations.forEach((a: any) => {
                    const href = a.getAttribute('href');
                    const originalText = a.textContent?.trim() || '';
                    if (!href) return;

                    let sourceIndex = sources.findIndex(s => s.url === href);
                    if (sourceIndex === -1) {
                        sourceIndex = sources.length;
                        sources.push({ index: sourceIndex + 1, url: href, title: originalText });
                    }

                    // Replace text with [^i] in the clone so innerText captures it
                    a.textContent = `[^${sourceIndex + 1}]`;
                });

                // 2. Extract Thoughts (Best Effort)
                // Search live DOM for headers "Step X" / "Krok X"
                const parent = container.parentElement?.parentElement || document.body;
                const stepElements = Array.from(parent.querySelectorAll('*')).filter((el: any) =>
                    /^(Step|Fáze|Krok)\s+\d+$/i.test((el.textContent || '').trim())
                );

                stepElements.forEach((stepHeader: any) => {
                    let content = '';
                    if (stepHeader.nextElementSibling) {
                        content = (stepHeader.nextElementSibling as HTMLElement).innerText;
                    }
                    if (content) {
                        thoughts.push(`**${stepHeader.textContent?.trim()}**: ${content.trim()}`);
                    }
                });

                return {
                    answer: clone.innerText, // Use cloned text with footnotes
                    html: container.innerHTML,
                    sources,
                    thoughts
                };
            }, [newAnswerIndex, config.selectors.answerContainer]);

            // --- Markdown Formatting ---
            let markdown = `### Answer\n\n${data.answer}\n\n`;

            if (data.thoughts && data.thoughts.length > 0) {
                markdown = `### Thoughts\n\n${data.thoughts.join('\n\n')}\n\n` + markdown;
            }

            if (data.sources && data.sources.length > 0) {
                markdown += `### Sources\n`;
                data.sources.forEach(s => {
                    markdown += `[^${s.index}]: [${s.title}](${s.url})\n`;
                });
            }

            const result: QueryResponse = {
                query: queryText,
                answer: data.answer,
                markdown: markdown,
                sources: data.sources,
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
                const mdPath = filepath.replace('.json', '.md');
                fs.writeFileSync(mdPath, markdown);
                console.log(`Result saved to ${filepath} and ${mdPath}`);
            } catch (e: any) {
                console.error(`Error saving result: ${e.message}`);
            }

            return result;

        } catch (error: any) {
            console.error('Unexpected error in Perplexity query:', error);
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
