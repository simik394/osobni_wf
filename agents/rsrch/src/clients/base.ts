// BrowserClient implementation
import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
chromium.use(StealthPlugin());
import { NotebookLMClient } from './notebooklm';
import { GeminiClient } from './gemini';
import { PerplexityClient } from './perplexity';
import { KeepClient } from './keep';
import { BrowserContext, Page, Browser } from 'playwright';
import { config } from '../config';
import { selectors } from '../selectors';
import * as fs from 'fs';
import * as path from 'path';
import { loadStorageState, saveStorageState, getStateDir, ensureProfileDir } from '../services/profile';
import { getTab, markTabBusy, markTabFree } from '@agents/shared';
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
        if (!this.isInitialized) return false;
        if (this.isConnectedOverCDP) {
            return this.browser !== null && this.browser.isConnected();
        }
        return this.browser !== null || this.context !== null;
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
    private leasedPages: Page[] = [];

    constructor(options: ClientOptions = {}) {
        super(options);
    }

    async init(options: { keepAlive?: boolean, local?: boolean, profileId?: string, cdpEndpoint?: string, force?: boolean } = {}) {
        if (this.isInitialized && !options.force) {
            if (this.isConnectedOverCDP) {
                if (this.browser && this.browser.isConnected()) {
                    this.log('Client already initialized and connected');
                    return;
                } else {
                    this.log('Client initialized but browser disconnected, re-initializing...');
                    this.isInitialized = false;
                }
            } else {
                this.log('Client already initialized (local)');
                return;
            }
        }
        this.keepAlive = options.keepAlive || this.options.keepAlive || false;

        const profileId = options.profileId || this.options.profileId || 'default';
        this.profileId = profileId;
        
        // CDP endpoint override for container mode
        const cdpEndpoint = options.cdpEndpoint || this.options.cdpEndpoint || config.browserCdpEndpoint;

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
                    // Fix protocol for fetch
                    const fetchTarget = target.replace(/^ws/, 'http');
                    console.log(`Fetching version from: ${fetchTarget}/json/version`);
                    
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), 3000);
                    
                    // @ts-ignore
                    const response = await fetch(`${fetchTarget}/json/version`, { signal: controller.signal });
                    clearTimeout(timeoutId);
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
                    console.warn(`[BrowserClient] CDP connection failed: ${manualError.message}. Falling back to local mode.`);
                }
            }

            if (this.browser) {
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
            }
        }

        if (!this.isInitialized) {
            // Truly local launch
            const headless = process.env.HEADLESS !== 'false'; // Default to headless
            
            if (!headless && process.env.FORCE_LOCAL_BROWSER !== 'true') {
                throw new Error('STRICT POLICY: Headful local browser launch PROHIBITED for agents. Set FORCE_LOCAL_BROWSER=true if you are a human debugging locally.');
            }
            
            const stateDir = getStateDir(profileId);
            ensureProfileDir(profileId);
            
            const userAgent = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
            
            console.log(`[BrowserClient] Local launch: headless=${headless}, stateDir=${stateDir}`);
            this.context = await (chromium as any).launchPersistentContext(stateDir, {
                headless: headless,
                slowMo: 100,
                userAgent,
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
        const pages = this.context.pages();
        if (pages.length > 0) {
            const url = pages[0].url();
            if (url.includes('accounts.google.com')) {
                console.log('[BrowserClient] Skipping auth save: currently on Google Accounts page (avoiding session corruption)');
                return;
            }
        }
        await saveStorageState(this.context, this.profileId);
    }

    async createGeminiClient(): Promise<GeminiClient> {
        if (!this.context) throw new Error('Browser not initialized');
        const page = await getTab(this.context as any, 'gemini');
        this.leasedPages.push(page);
        return new GeminiClient(page);
    }

    async createNotebookLMClient(): Promise<NotebookLMClient> {
        if (!this.context) throw new Error('Browser not initialized');
        const page = await getTab(this.context as any, 'notebooklm' as any);
        this.leasedPages.push(page);
        return new NotebookLMClient(page);
    }

    async createPerplexityClient(): Promise<PerplexityClient> {
        if (!this.context) throw new Error('Browser not initialized');
        const page = await getTab(this.context as any, 'perplexity' as any);
        this.leasedPages.push(page);
        return new PerplexityClient(page);
    }

    async createKeepClient(): Promise<KeepClient> {
        if (!this.context) throw new Error('Browser not initialized');
        console.log('[BrowserClient] Calling getTab for keep...');
        const page = await getTab(this.context as any, 'keep' as any);
        this.leasedPages.push(page);
        return new KeepClient(page);
    }

    /**
     * Get a pooled tab for a specific service.
     * Use this for standalone utilities to ensure TabPool compliance.
     */
    async getTabPage(serviceName: string): Promise<Page> {
        if (!this.context) throw new Error('Browser not initialized');
        const page = await getTab(this.context as any, serviceName as any);
        this.leasedPages.push(page);
        return page;
    }

    async openPage(url: string): Promise<Page> {
        if (!this.context) throw new Error('Browser not initialized');
        console.warn('⚠️ [BrowserClient] openPage() is INEFFICIENT. Use createNotebookLMClient() or getTab() to reuse existing tabs.');
        const page = await this.context.newPage();
        this.leasedPages.push(page);
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        return page;
    }

    async close() {
        if (this.keepAlive) {
            console.log('Browser kept alive (use shutdown() to force close)');
            // Even if kept alive, we MUST release leased pages to the pool
            await this.release();
            return;
        }
        await this.shutdown();
    }

    /**
     * Explicitly release all leased pages back to the TabPool.
     * Essential for efficiency on shared browsers (halvarm).
     */
    async release() {
        if (this.leasedPages.length === 0) return;
        
        console.log(`♻️ [BrowserClient] Releasing ${this.leasedPages.length} leased pages to pool...`);
        for (const page of this.leasedPages) {
            try {
                await markTabFree(page);
            } catch (e) {
                // Page might be closed, ignore
            }
        }
        this.leasedPages = [];
    }

    async shutdown() {
        try {
            await this.saveAuth();
        } catch (e: any) {
            console.error('Failed to save auth on shutdown:', e.message);
        }

        if (!this.browser && !this.context) return;
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
            if (this.browser) {
                await this.browser.close().catch(() => {});
            } else if (this.context) {
                await this.context.close().catch(() => {});
            }
            this.browser = null;
            this.context = null;
            this.isInitialized = false;
            console.log('Browser shutdown complete');
        }
        
        this.keepAlive = false;
    }
}
