import { chromium } from 'playwright-extra';
import { NotebookLMClient } from './notebooklm-client';
import { GeminiClient } from './gemini-client';
import { chromium as playwrightChromium, BrowserContext, Page, Browser } from 'playwright';
// import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { config } from './config';
import * as fs from 'fs';
import * as path from 'path';
import { loadStorageState, saveStorageState, getStateDir, ensureProfileDir } from './profile';
import { getTab, markTabBusy, markTabFree } from '@agents/shared/tab-pool';

// Add stealth plugin - DISABLED for debugging browser closure issue
// chromium.use(StealthPlugin());

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

export interface ClientOptions {
    headless?: boolean;
    userDataDir?: string;
    keepAlive?: boolean;
    verbose?: boolean;
    profileId?: string;
    cdpEndpoint?: string; // Override CDP endpoint for container mode
}

export abstract class BaseClient {
    protected browser: Browser | null = null;
    protected context: BrowserContext | null = null;
    protected page: Page | null = null;
    protected options: ClientOptions;
    protected isInitialized = false;
    protected profileId: string = 'default';

    constructor(options: ClientOptions = {}) {
        this.options = { headless: true, ...options };
        this.profileId = options.profileId || 'default';
    }

    protected log(message: string) {
        if (this.options.verbose) {
            console.log(`[DEBUG] ${message}`);
        }
    }

    getProfileId(): string {
        return this.profileId;
    }

    isBrowserInitialized(): boolean {
        return this.isInitialized;
    }
}

export class PerplexityClient extends BaseClient {
    private sessions: Session[] = [];
    private keepAlive = false; // This will be set based on options.keepAlive

    constructor(options: ClientOptions = {}) {
        super(options);
    }

    async init(options: { keepAlive?: boolean, local?: boolean, profileId?: string, cdpEndpoint?: string } = {}) {
        if (this.isInitialized) {
            this.log('Client already initialized');
            return;
        }
        this.keepAlive = options.keepAlive || this.options.keepAlive || false;

        // Profile support: use passed profileId or fall back to options or 'default'
        const profileId = options.profileId || this.options.profileId || 'default';
        this.profileId = profileId;
        console.log(`[Client] Using profile: ${profileId}`);

        // CDP endpoint override for container mode
        const cdpEndpoint = options.cdpEndpoint || this.options.cdpEndpoint;

        // Force local mode if requested, bypassing env vars
        if (!options.local && config.browserWsEndpoint) {
            console.log(`Connecting to browser service at ${config.browserWsEndpoint}...`);
            this.browser = await (chromium.connect(config.browserWsEndpoint) as unknown as Browser);

            // Load storage state from profile
            const storageState = loadStorageState(profileId);

            if (!this.browser) throw new Error('Browser not initialized');
            this.context = await this.browser.newContext({
                storageState: storageState,
                viewport: { width: 1280, height: 1024 } // specific viewport for VNC
            });

            // Add anti-detection scripts for every new page
            if (this.context) {
                await this.context.addInitScript(() => {
                    // 1. WebDriver - return false, not undefined
                    Object.defineProperty(navigator, 'webdriver', {
                        get: () => false,
                        configurable: true
                    });

                    // 2. Languages - realistic
                    Object.defineProperty(navigator, 'languages', {
                        get: () => ['en-US', 'en', 'cs'],
                        configurable: true
                    });

                    // 3. Plugins - realistic plugin array
                    Object.defineProperty(navigator, 'plugins', {
                        get: () => {
                            const plugins = [
                                { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
                                { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '' },
                                { name: 'Native Client', filename: 'internal-nacl-plugin', description: '' }
                            ] as any;
                            plugins.item = (i: number) => plugins[i];
                            plugins.namedItem = (name: string) => plugins.find((p: any) => p.name === name);
                            plugins.refresh = () => { };
                            return plugins;
                        },
                        configurable: true
                    });

                    // 4. Hardware concurrency - realistic value
                    Object.defineProperty(navigator, 'hardwareConcurrency', {
                        get: () => 8,
                        configurable: true
                    });

                    // 5. Device memory - realistic value  
                    Object.defineProperty(navigator, 'deviceMemory', {
                        get: () => 8,
                        configurable: true
                    });

                    // 6. Max touch points
                    Object.defineProperty(navigator, 'maxTouchPoints', {
                        get: () => 0,
                        configurable: true
                    });

                    // 7. Chrome runtime object - complete
                    if (!(window as any).chrome) {
                        (window as any).chrome = {};
                    }
                    (window as any).chrome.runtime = {
                        connect: () => { },
                        sendMessage: () => { },
                        onMessage: { addListener: () => { } },
                        id: undefined
                    };
                    (window as any).chrome.app = {
                        isInstalled: false,
                        InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' },
                        RunningState: { CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' }
                    };
                    (window as any).chrome.csi = () => ({});
                    (window as any).chrome.loadTimes = () => ({});

                    // 8. WebGL vendor/renderer spoofing
                    const getParameterProto = WebGLRenderingContext.prototype.getParameter;
                    WebGLRenderingContext.prototype.getParameter = function (param) {
                        if (param === 37445) return 'Intel Inc.'; // UNMASKED_VENDOR_WEBGL
                        if (param === 37446) return 'Intel Iris OpenGL Engine'; // UNMASKED_RENDERER_WEBGL
                        return getParameterProto.call(this, param);
                    };

                    // Also for WebGL2
                    if (typeof WebGL2RenderingContext !== 'undefined') {
                        const getParameterProto2 = WebGL2RenderingContext.prototype.getParameter;
                        WebGL2RenderingContext.prototype.getParameter = function (param) {
                            if (param === 37445) return 'Intel Inc.';
                            if (param === 37446) return 'Intel Iris OpenGL Engine';
                            return getParameterProto2.call(this, param);
                        };
                    }

                    // 9. Permissions API - more realistic
                    const originalQuery = window.navigator.permissions.query;
                    window.navigator.permissions.query = (parameters: any) => {
                        if (parameters.name === 'notifications') {
                            return Promise.resolve({ state: 'prompt', onchange: null } as PermissionStatus);
                        }
                        return originalQuery(parameters);
                    };

                    // 10. Connection API spoofing
                    if (!(navigator as any).connection) {
                        Object.defineProperty(navigator, 'connection', {
                            get: () => ({
                                effectiveType: '4g',
                                rtt: 50,
                                downlink: 10,
                                saveData: false
                            }),
                            configurable: true
                        });
                    }

                    console.log('[Stealth] Advanced anti-detection scripts loaded');
                });
            }

        } else if (!options.local && (cdpEndpoint || config.browserCdpEndpoint || config.remoteDebuggingPort)) {
            try {
                // CDP/WebSocket connection to remote browser
                // Priority: explicit cdpEndpoint > BROWSER_CDP_ENDPOINT > REMOTE_DEBUGGING_PORT
                let endpoint = cdpEndpoint || config.browserCdpEndpoint ||
                    `http://localhost:${config.remoteDebuggingPort}`;
                console.log(`Connecting to browser at ${endpoint} (profile: ${profileId})...`);

                // Normalize endpoint
                if (!endpoint.startsWith('http') && !endpoint.startsWith('ws')) {
                    endpoint = `http://${endpoint}`;
                }

                try {
                    // Method 1: Try connecting via standard CDP (http endpoint)
                    console.log(`Attempting connectOverCDP to ${endpoint}...`);
                    this.browser = await (chromium.connectOverCDP(endpoint, { timeout: 5000 }) as unknown as Browser);
                    console.log('Connected via connectOverCDP');
                } catch (e: any) {
                    console.log(`connectOverCDP failed: ${e.message}`);
                    console.log('Attempting manual WebSocket URL fetching and fix...');

                    try {
                        // Manual fetch of version metadata
                        // @ts-ignore
                        const response = await fetch(`${endpoint}/json/version`);
                        if (!response.ok) throw new Error(`Failed to fetch version info: ${response.statusText}`);

                        const data = await response.json();
                        let wsEndpoint = data.webSocketDebuggerUrl;

                        if (!wsEndpoint) throw new Error('No webSocketDebuggerUrl found in version info');

                        console.log(`Original WS Endpoint: ${wsEndpoint}`);

                        // Fix hostname if it's 'chromium' or differs from our endpoint hostname
                        // If we are connecting to localhost:9225, we want ws://localhost:9225/...
                        // The original might be ws://chromium:9223/...
                        // We replace the host and port part.

                        // Parse local endpoint to get host/port
                        const localUrl = new URL(endpoint);
                        const wsUrl = new URL(wsEndpoint);

                        // If the ws host is 'chromium' or '172.x', force it to our endpoint host
                        if (wsUrl.hostname !== localUrl.hostname && (wsUrl.hostname === 'chromium' || localUrl.hostname === 'localhost' || localUrl.hostname === '127.0.0.1')) {
                            wsUrl.hostname = localUrl.hostname;
                            wsUrl.port = localUrl.port;
                            wsEndpoint = wsUrl.toString();
                            console.log(`Fixed WS Endpoint: ${wsEndpoint}`);
                        }

                        this.browser = await (chromium.connectOverCDP(wsEndpoint) as unknown as Browser);
                        console.log('Connected via chromium.connectOverCDP (Manual WS Fix)');

                    } catch (manualError: any) {
                        throw new Error(`Failed to connect to browser via manual WS fix. 
                        Original CDP Error: ${e.message}
                        Manual Error: ${manualError.message}`);
                    }
                }

                if (!this.browser) throw new Error('Browser failed to initialize');

                // For CDP connections, prefer reusing the browser's existing context
                // (where the user logged in via VNC) instead of creating a new one
                const existingContexts = this.browser.contexts();
                if (existingContexts.length > 0) {
                    this.context = existingContexts[0];
                    console.log(`[Client] Reusing existing browser context (profile: ${profileId}, contexts: ${existingContexts.length})`);

                    // DON'T inject cookies when connecting via CDP!
                    // The browser already has auth from VNC login.
                    // Injecting stale cookies from local profile would break the session.
                    const pages = this.context.pages();
                    console.log(`[Client] Browser has ${pages.length} existing pages`);
                } else {
                    // Only create new context if none exist (shouldn't happen normally)
                    const storageState = loadStorageState(profileId);
                    this.context = await this.browser.newContext({
                        storageState: storageState,
                        viewport: { width: 1280, height: 1024 }
                    });
                    console.log(`[Client] Created new browser context for profile: ${profileId}`);
                }
            } catch (e: any) {
                throw new Error(`Could not acquire context from remote browser: ${e.message}`);
            }
        } else {
            // Local mode - use profile-based state directory
            console.log(`Launching browser (Local Mode, profile: ${profileId})...`);

            // Get or create profile state directory
            const stateDir = getStateDir(profileId);
            ensureProfileDir(profileId);
            if (!fs.existsSync(stateDir)) {
                fs.mkdirSync(stateDir, { recursive: true });
            }

            // Default to HEADED as per user preference ("NO HEADLESS")
            // In Local Mode inside Docker with Xvfb, we MUST set headless: false to use the display.
            const headless = false;
            console.log(`Headless: ${headless} (Forced for Local Mode verification)`);

            console.log(`Launching persistent context from: ${stateDir}`);
            // Force slowMo 100 for Google account safety (User Rule)
            this.context = await (chromium as any).launchPersistentContext(stateDir, {
                headless: headless,
                slowMo: 100,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-blink-features=AutomationControlled',
                    '--disable-infobars',
                    '--window-size=1280,1024',
                    '--no-first-run',
                    '--no-zygote',
                    // '--disable-gpu', // GPU might be useful if available, but generally disable in docker unless passthrough
                    '--disable-web-security'
                ],
                ignoreDefaultArgs: ['--enable-automation'],
                viewport: { width: 1280, height: 1024 }
            });

            // Get or create page
            if (!this.context) throw new Error('Failed to create browser context');
            this.page = this.context.pages()[0] || await this.context.newPage();

            // Inject auth from auth.json if available (restores synced sessions)
            try {
                const storageState = loadStorageState(profileId);
                if (storageState && storageState.cookies && storageState.cookies.length > 0) {
                    await this.context.addCookies(storageState.cookies);
                    console.log(`[Client] Injected ${storageState.cookies.length} auth cookies from auth.json`);
                } else {
                    console.log(`[Client] No auth cookies found in auth.json for profile '${profileId}'`);
                }
            } catch (e: any) {
                console.warn(`[Client] Failed to inject auth from auth.json: ${e.message}`);
            }

            console.log('Browser ready');
            this.isInitialized = true;
        }
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

    async query(queryText: string, options: { sessionName?: string, sessionId?: string, deepResearch?: boolean } = {}): Promise<QueryResponse> {
        if (!this.isInitialized || !this.context) {
            throw new Error('Client not initialized. Call init() first.');
        }

        console.log(`Running query: "${queryText}" (Deep Research: ${options.deepResearch || false})`);

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

            // Toggle Deep Research if requested
            if (options.deepResearch) {
                console.log('Activating Deep Research mode...');
                try {
                    // Try to find the "Research" button (aria-label="Research")
                    const deepButtonSelector = 'button[aria-label="Research"]';
                    if (await page.isVisible(deepButtonSelector)) {
                        await page.click(deepButtonSelector);
                        console.log('Clicked "Research" button (Deep Research).');
                        await page.waitForTimeout(1000);
                    } else {
                        console.warn('Deep Research button not found. Proceeding with standard search.');
                    }
                } catch (e) {
                    console.error('Failed to toggle Deep Research:', e);
                }
            }

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
        await saveStorageState(this.context, this.profileId);
    }

    async createNotebookClient(): Promise<NotebookLMClient> {
        if (!this.context) throw new Error('Context not initialized');

        // Check if there's already a NotebookLM page we can reuse
        const existingPages = this.context.pages();
        for (const page of existingPages) {
            const url = page.url();
            if (url.includes('notebooklm.google.com')) {
                console.log('[Client] Reusing existing NotebookLM page');
                return new NotebookLMClient(page);
            }
        }

        // No existing page, create new one
        console.log('[Client] Creating new NotebookLM page');
        const page = await this.context.newPage();
        return new NotebookLMClient(page);
    }

    async createGeminiClient(): Promise<GeminiClient> {
        if (!this.browser) throw new Error('Browser not initialized');

        console.log('[Client] Acquiring Gemini tab from pool...');
        // Use shared TabPool to respect global limits and efficient reuse
        const page = await getTab(this.browser, 'gemini');

        return new GeminiClient(page);
    }

    async close() {
        if (this.keepAlive) {
            console.log('Browser kept alive (use shutdown() to force close)');
            return;
        }
        await this.shutdown();
    }

    async shutdown() {
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
        this.keepAlive = false;
        console.log('Browser closed');
    }
}
