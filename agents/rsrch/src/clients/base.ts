import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
chromium.use(StealthPlugin());
import { NotebookLMClient } from './notebooklm';
import { GeminiClient } from './gemini';
import { BrowserContext, Page, Browser } from 'playwright';
import { config } from '../config';
import { selectors } from '../selectors';
import * as fs from 'fs';
import * as path from 'path';
import { loadStorageState, saveStorageState, getStateDir, ensureProfileDir } from '../services/profile';
import { getTab, markTabBusy, markTabFree } from '@agents/shared/tab-pool';
import { UniversalContext } from '../actions/types';

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
    cdpEndpoint?: string; 
}

export abstract class BaseClient {
    protected browser: Browser | null = null;
    protected context: BrowserContext | null = null;
    protected page: Page | null = null;
    protected options: ClientOptions;
    protected isInitialized = false;
    protected profileId: string = 'default';
    protected isConnectedOverCDP: boolean = false;

    constructor(options: ClientOptions = {}) {
        this.options = { headless: config.headless, ...options };
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
        return this.isInitialized && (this.browser !== null || this.context !== null);
    }

    protected getContext(): UniversalContext {
        if (!this.page) throw new Error('Browser not initialized');
        return {
            page: this.page,
            log: (msg, level) => this.log(msg),
            config,
        };
    }
}

/**
 * Main Browser Automation Client (formerly BrowserClient)
 */
export class BrowserClient extends BaseClient {
    private sessions: Session[] = [];
    private keepAlive = false;

    constructor(options: ClientOptions = {}) {
        super(options);
    }

    async init(options: { keepAlive?: boolean, local?: boolean, profileId?: string, cdpEndpoint?: string } = {}) {
        if (this.isInitialized) {
            this.log('Client already initialized');
            return;
        }
        this.keepAlive = options.keepAlive || this.options.keepAlive || false;

        const profileId = options.profileId || this.options.profileId || 'default';
        this.profileId = profileId;
        
        // CDP endpoint override for container mode
        const cdpEndpoint = options.cdpEndpoint || this.options.cdpEndpoint || process.env.BROWSER_CDP_ENDPOINT;

        if (cdpEndpoint) {
            // CDP Mode (Remote Control)
            console.log(`[BrowserClient] Connecting via CDP to ${cdpEndpoint} (profile: ${profileId})...`);

            let target = cdpEndpoint;
            if (!target.startsWith('http') && !target.startsWith('ws')) {
                target = `http://${target}`;
            }

            try {
                // Method 1: Try connecting via standard CDP (http endpoint)
                console.log(`Attempting connectOverCDP to ${target}...`);
                this.browser = await (chromium.connectOverCDP(target as string, { timeout: 5000 }) as unknown as Browser);
                this.isConnectedOverCDP = true;
                console.log('Connected via connectOverCDP');
            } catch (e: any) {
                console.log(`connectOverCDP failed: ${e.message}, attempting manual WS fetch...`);
                try {
                    // @ts-ignore
                    const response = await fetch(`${target}/json/version`);
                    if (!response.ok) throw new Error(`Failed to fetch version info: ${response.statusText}`);
                    const data = await response.json();
                    let wsEndpoint = data.webSocketDebuggerUrl;
                    if (!wsEndpoint) throw new Error('No webSocketDebuggerUrl found');

                    const localUrl = new URL(target);
                    const wsUrl = new URL(wsEndpoint);
                    if (wsUrl.hostname !== localUrl.hostname && (wsUrl.hostname === 'chromium' || localUrl.hostname === 'localhost' || localUrl.hostname === '127.0.0.1')) {
                        wsUrl.hostname = localUrl.hostname;
                        wsUrl.port = localUrl.port;
                        wsEndpoint = wsUrl.toString();
                    }

                    this.browser = await (chromium.connectOverCDP(wsEndpoint) as unknown as Browser);
                    this.isConnectedOverCDP = true;
                    console.log('Connected via chromium.connectOverCDP (Manual WS Fix)');
                } catch (manualError: any) {
                    throw new Error(`Failed to connect to browser: ${manualError.message}`);
                }
            }

            if (!this.browser) throw new Error('Browser failed to initialize');

            // SMARTER CONTEXT REUSE: Prefer existing interactive context
            const existingContexts = this.browser.contexts();
            if (existingContexts.length > 0) {
                this.context = existingContexts[0];
                console.log(`[BrowserClient] Reusing existing browser context (contexts: ${existingContexts.length})`);
            } else {
                console.log(`[BrowserClient] No active context found, creating new for profile: ${profileId}`);
                const storageState = loadStorageState(profileId);
                this.context = await this.browser.newContext({
                    storageState: storageState,
                    viewport: { width: 1280, height: 1024 }
                });
            }
            this.isInitialized = true;

        } else {
            // Local mode
            if (!options.local && config.browserWsEndpoint) {
                // Legacy websocket connection (rarely used now)
                this.browser = await (chromium.connect(config.browserWsEndpoint) as unknown as Browser);
                this.context = await this.browser.newContext({
                    storageState: loadStorageState(profileId),
                    viewport: { width: 1280, height: 1024 }
                });
            } else {
                // Truly local launch
                if (process.env.FORCE_LOCAL_BROWSER !== 'true') {
                    throw new Error('STRICT POLICY: Local browser launch PROHIBITED for agents. Set FORCE_LOCAL_BROWSER=true if you are a human debugging locally.');
                }
                const stateDir = getStateDir(profileId);
                ensureProfileDir(profileId);
                const headless = process.env.FORCE_LOCAL_BROWSER === 'true' ? false : this.options.headless;
                
                this.context = await (chromium as any).launchPersistentContext(stateDir, {
                    headless: headless,
                    slowMo: 100,
                    args: [
                        '--no-sandbox',
                        '--disable-setuid-sandbox',
                        '--disable-blink-features=AutomationControlled',
                        '--disable-infobars',
                        '--window-size=1280,1024',
                        '--disable-web-security',
                        '--remote-debugging-port=9223',
                        '--remote-debugging-address=0.0.0.0',
                        '--disable-gpu',
                        '--disable-dev-shm-usage',
                        '--no-first-run',
                        '--no-default-browser-check',
                        '--password-store=basic',
                        '--use-mock-keychain'
                    ],
                    ignoreDefaultArgs: ['--enable-automation'],
                    viewport: { width: 1280, height: 1024 }
                });
                
                // Inject cookies if available
                const storageState = loadStorageState(profileId);
                if (storageState?.cookies?.length > 0 && this.context) {
                    await this.context.addCookies(storageState.cookies);
                }
            }
            
            this.isInitialized = true;
        }

        // Common initialization (stealth, etc)
        if (this.context) {
            await this.context.addInitScript(() => {
                Object.defineProperty(navigator, 'webdriver', { get: () => false, configurable: true });
                Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'], configurable: true });
            });
        }
    }

    private async createSession(name?: string): Promise<Session> {
        if (!this.context) throw new Error('Context not initialized');
        const page = await this.context.newPage();
        const id = Math.random().toString(36).substring(2, 9);
        const session: Session = { id, name, page, createdAt: Date.now() };
        this.sessions.push(session);
        console.log(`Created new session: ${id} ${name ? `(${name})` : ''}`);
        if (this.sessions.length > 5) {
            const oldSession = this.sessions.shift();
            if (oldSession) await oldSession.page.close().catch(() => {});
        }
        return session;
    }

    private getSession(selector: string = 'new'): Session | undefined {
        if (selector === 'new') return undefined;
        if (selector === 'latest' || selector === 'last') return this.sessions[this.sessions.length - 1];
        const byId = this.sessions.find(s => s.id === selector);
        if (byId) return byId;
        const byName = this.sessions.find(s => s.name === selector);
        if (byName) return byName;
        const index = parseInt(selector);
        if (!isNaN(index) && index >= 0 && index < this.sessions.length) return this.sessions[index];
        return undefined;
    }

    async query(queryText: string, options: { sessionName?: string, sessionId?: string, deepResearch?: boolean } = {}): Promise<QueryResponse> {
        throw new Error('Query method not implemented in BrowserClient. Use specialized subclasses.');
    }

    async saveAuth() {
        if (!this.context) return;
        await saveStorageState(this.context, this.profileId);
    }

    async createGeminiClient(): Promise<GeminiClient> {
        if (!this.context) throw new Error('Browser not initialized');
        const page = await getTab(this.context as any, 'gemini');
        return new GeminiClient(page);
    }

    async createNotebookLMClient(): Promise<NotebookLMClient> {
        if (!this.context) throw new Error('Browser not initialized');
        const page = await getTab(this.context as any, 'notebooklm' as any);
        return new NotebookLMClient(page);
    }

    async openPage(url: string): Promise<Page> {
        if (!this.context) throw new Error('Browser not initialized');
        const page = await this.context.newPage();
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        return page;
    }

    async close() {
        if (this.keepAlive) {
            console.log('Browser kept alive (use shutdown() to force close)');
            return;
        }
        await this.shutdown();
    }

    async shutdown() {
        try {
            await this.saveAuth();
        } catch (e: any) {
            console.error('Failed to save auth on shutdown:', e.message);
        }

        if (!this.browser) return;
        if (this.isConnectedOverCDP) {
            // Over CDP, we just want to disconnect. Playwright does this on process exit or browser.close().
            // To be safe and silent, we just nullify references.
            this.browser = null;
            this.context = null;
            this.isInitialized = false;
        } else {
            console.log('Closing local browser...');
            for (const session of this.sessions) {
                await session.page.close().catch(() => { });
            }
            this.sessions = [];
            await this.browser.close().catch(() => {});
            this.browser = null;
            this.context = null;
            this.isInitialized = false;
            console.log('Browser shutdown complete');
        }
        
        this.keepAlive = false;
    }
}
