import { Page } from 'playwright';
import { EventEmitter } from 'events';
import { config } from '../config';
import { selectors } from '../selectors';
import { getRsrchTelemetry } from '@agents/shared';
import { getGraphStore } from '../core/graph-store';
import { GeminiActionDeps, UniversalContext } from '../actions/types';
import * as actions from '../actions/gemini';

const telemetry = getRsrchTelemetry();

/**
 * GeminiClient is a lightweight wrapper around modular action modules.
 * It provides a class-based interface for legacy compatibility while
 * delegating all actual logic to stateless, modular actions.
 */
export class GeminiClient extends EventEmitter {
    private verbose: boolean = false;
    private ctx: UniversalContext;
    private deps: GeminiActionDeps;

    constructor(public page: Page, options: { verbose?: boolean } = {}) {
        super();
        this.verbose = options.verbose || false;
        
        this.ctx = {
            page: this.page,
            log: (msg: string, level?: 'info' | 'warn' | 'error') => this.log(msg, level),
            config,
        };

        // Use instance methods directly in closures to ensure spies work in tests
        this.deps = {
            selectors,
            telemetry,
            verbose: this.verbose,
            getGraphStore: () => getGraphStore(),
            checkAuth: async () => this.checkAuth(),
            getCurrentSessionId: () => this.getCurrentSessionIdSync(),
            getLatestResponseData: async () => await this.getLatestResponseData(),
            getLatestResponse: async () => await this.getLatestResponse(),
            injectText: async (text: string) => await this.injectText(text),
            injectUrl: async (url: string) => await this.injectUrl(url),
            injectSources: async (sources: any[]) => await this.injectSources(sources),
            
            setModel: async (model: string) => await this.setModel(model),
            resetToNewChat: async () => await this.resetToNewChat(),
            
            uploadFiles: async (files: string[]) => await this.uploadFiles(files),
            uploadFromDrive: async (fileName: string) => await this.uploadFromDrive(fileName),
            recycle: async () => {
                const { BrowserClient } = await import('./base');
                const b = new BrowserClient();
                await b.init({ profileId: 'default' });
                
                if ((b as any).recycleTabPage) await (b as any).recycleTabPage('gemini');
                if (b.release) await b.release();
            },
            dumpState: async (name: string) => await this.dumpState(name),
            listGems: async () => await this.listGems(),
            selectGem: async (name: string) => await this.selectGem(name),
            checkModelStatus: async () => await this.getModelStatus(),
            listArtifacts: async () => await this.listArtifacts(),
            readCanvas: async () => await this.readCanvas(),
            openArtifact: async (name: string) => await this.openArtifact(name),
            scrollToTop: async () => await this.scrollToTop()
        };
    }

    async dumpState(name: string) {
        const fs = await import('fs');
        const path = await import('path');
        const timestamp = Date.now();
        const baseName = `${name}_${timestamp}`;
        const dataDir = path.join(config.paths.resultsDir, 'debug');
        if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

        const htmlPath = path.join(dataDir, `${baseName}.html`);
        const pngPath = path.join(dataDir, `${baseName}.png`);
        await fs.promises.writeFile(htmlPath, await this.page.content());
        await this.page.screenshot({ path: pngPath, fullPage: true });
        return { htmlPath, pngPath };
    }

    private log(message: string, level: 'info' | 'warn' | 'error' = 'info') {
        if (this.verbose || level === 'error' || level === 'warn') {
            const prefix = level === 'info' ? '[Gemini]' : `[Gemini][${level.toUpperCase()}]`;
            console.log(`${prefix} ${message}`);
        }
    }

    // --- Core Interaction Bridge ---

    async sendMessage(message: string, options: any = {}) {
        
        return actions.sendMessageAction(this.ctx, message, options, this.deps as GeminiActionDeps);
    }

    async submitMessage(message: string, options: any = {}) {
        
        return actions.submitMessageAction(this.ctx, message, options, this.deps as GeminiActionDeps);
    }

    async watchResponse(options: any = {}) {
        
        return actions.watchResponseAction(this.ctx, options, this.deps as GeminiActionDeps);
    }

    async extractResponse(messageSelector?: string) {
        
        return actions.extractResponseAction(this.ctx, this.deps as GeminiActionDeps, messageSelector);
    }

    async injectText(text: string) {
        const input = this.page.locator(selectors.gemini.chat.input).first();
        if (await input.isVisible()) {
            await input.click();
        }
        await input.fill(text);
    }

    async injectUrl(url: string) {
        return this.injectText(url);
    }

    async injectSources(sources: { type: string; content: string }[]) {
        for (const source of sources) {
            if (source.type === 'file') {
                await this.uploadFiles([source.content]);
            } else if (source.type === 'url') {
                await this.injectUrl(source.content);
            } else if (source.type === 'text') {
                await this.injectText(source.content);
            }
        }
    }

    // --- Session & State ---

    async resetToNewChat() {
        return actions.resetToNewChatAction(this.ctx, this.deps as GeminiActionDeps);
    }

    async listSessions(options: { 
        limit?: number, 
        offset?: number, 
        query?: string, 
        pinnedOnly?: boolean,
        strategy?: 'search' | 'scroll' | 'hybrid'
    } = {}) {
        return actions.listSessionsAction(this.ctx, this.deps as GeminiActionDeps, options);
    }

    async setModel(model: string) {
        // Optional: Pre-check status if it's "pro" to warn early
        if (model.toLowerCase().includes('pro')) {
            const statuses = await this.getModelStatus();
            const pro = statuses.find(s => s.id === 'pro');
            if (pro?.isLimited) {
                this.log(`Warning: Target model "Pro" is currently limited. Reset time: ${pro.resetTime || 'unknown'}`, 'warn');
            }
        }
        return actions.setModelAction(this.ctx, this.deps as GeminiActionDeps, model);
    }

    async getModelStatus() {
        return actions.checkModelStatusAction(this.ctx, this.deps as GeminiActionDeps);
    }

    async listGems() {
        return actions.listGemsAction(this.ctx, this.deps as GeminiActionDeps);
    }

    async selectGem(name: string) {
        return actions.selectGemAction(this.ctx, this.deps as GeminiActionDeps, name);
    }

    async ensureSidebar() {
        return actions.ensureSidebarAction(this.ctx, this.deps as GeminiActionDeps);
    }

    async listArtifacts() {
        return actions.listSessionArtifactsAction(this.ctx, this.deps as GeminiActionDeps);
    }

    async readCanvas() {
        return actions.readCanvasAction(this.ctx, this.deps as GeminiActionDeps);
    }

    async openArtifact(name: string) {
        return actions.openArtifactAction(this.ctx, this.deps as GeminiActionDeps, name);
    }

    async archiveArtifacts(options: { outputDir?: string } = {}) {
        return actions.archiveArtifactsAction(this.ctx, this.deps as GeminiActionDeps, options);
    }

    async shareSession() {
        return actions.shareSessionAction(this.ctx, this.deps as GeminiActionDeps);
    }

    async pinSession(sessionId?: string) {
        return actions.pinSessionAction(this.ctx, this.deps as GeminiActionDeps, true, sessionId);
    }

    async unpinSession(sessionId?: string) {
        return actions.pinSessionAction(this.ctx, this.deps as GeminiActionDeps, false, sessionId);
    }

    async updateCanvas(content: string, options?: { mode: 'replace' | 'append' }) {
        return actions.updateCanvasAction(this.ctx, this.deps as GeminiActionDeps, content, options);
    }

    async switchCanvasTab(tab: 'preview' | 'code') {
        return actions.switchCanvasTabAction(this.ctx, this.deps as GeminiActionDeps, tab);
    }

    async closeCanvas() {
        return actions.closeCanvasAction(this.ctx, this.deps as GeminiActionDeps);
    }

    async syncRegistryToGraph(manager: any) {
        return actions.syncRegistryToGraphAction(this.ctx, { ...(this.deps as GeminiActionDeps), researchManager: manager });
    }

    async researchToAudio(options: { artifactId: string, notebookTitle?: string, customPrompt?: string }) {
        return actions.researchToAudioAction(this.ctx, options);
    }

    async scrollToTop(options: { limit?: number, untilText?: string } = {}) {
        return actions.scrollToTopAction(this.ctx, this.deps as GeminiActionDeps, options);
    }

    async init(sessionId?: string) {
        if (sessionId) {
            await this.page.goto(`${config.urls.gemini}/app/${sessionId}`, { waitUntil: 'domcontentloaded' });
        } else {
            // Force navigation to home if no session provided (test requirement)
            await this.page.goto(`${config.urls.gemini}/app`, { waitUntil: 'domcontentloaded' });
        }

        // Handle initial state (auth, cookies, overlays)
        try {
            await actions.handleInitialOverlaysAction(this.ctx, this.deps as GeminiActionDeps);
            await actions.checkAuthRequiredAction(this.ctx, this.deps as GeminiActionDeps);
            
            // Wait for chat app to be ready
            await this.page.waitForSelector(selectors.gemini.chat.app, { timeout: 15000 }).catch(async (e) => {
                await this.dumpState('gemini_init_fail');
                throw e;
            });

            await this.ensureSidebar();
        } catch (e: any) {
            if (e.message.includes('authentication')) {
                await this.dumpState('gemini_auth_required');
            }
            throw e;
        }

        return true;
    }

    // --- High-Level Research Flow ---

    /** Legacy research bridge - alias for sendMessage */
    async research(query: string, options: any = {}) {
        return this.sendMessage(query, options);
    }

    /** Legacy streaming bridge */
    async researchWithStreaming(query: string, callback: (chunk: { content: string, isComplete?: boolean }) => void, options: any = {}) {
        let lastLen = 0;
        return this.sendMessage(query, { 
            ...options,
            onProgress: (text: string) => {
                const newContent = text.substring(lastLen);
                if (newContent) {
                    callback({ content: newContent, isComplete: false });
                    lastLen = text.length;
                }
            }
        }).then(res => {
            callback({ content: '', isComplete: true });
            return res;
        });
    }

    /** Legacy deep research bridge */
    async startDeepResearch(query: string, options: any = {}) {
        const gemName = typeof options === 'string' ? options : options.gem;
        this.log(`Starting deep research for: "${query}" (gem: ${gemName})`);
        
        const responseMarkdown = await this.sendMessage(query, { gem: gemName });
        if (!responseMarkdown) throw new Error('No response received from Gemini');

        const exportRes = await this.exportToGoogleDocs();

        return {
            success: true,
            markdown: responseMarkdown,
            docUrl: exportRes.docUrl,
            docId: exportRes.docId,
            docTitle: exportRes.docTitle
        };
    }

    /** Extracts info for watcher/summary */
    async getResearchInfo() {
        const url = this.page.url();
        const sessionId = url.includes('/app/') ? url.split('/app/')[1].split('?')[0] : null;
        const title = await this.page.title().then(t => t.replace('Gemini - ', '').trim()).catch(() => null);
        const firstHeading = await this.page.locator('h1, h2, .model-response h1').first().innerText().catch(() => null);
        return { sessionId, title, firstHeading };
    }

    // --- File & Export ---

    async uploadFiles(files: string[]) {
        
        return actions.uploadFilesAction(this.ctx, this.deps as GeminiActionDeps, files);
    }

    async uploadFromDrive(fileName: string) {
        
        return actions.uploadFromDriveAction(this.ctx, this.deps as GeminiActionDeps, fileName);
    }

    async exportToGoogleDocs() {
        
        return actions.exportToGoogleDocsAction(this.ctx, this.deps as GeminiActionDeps);
    }

    async exportCurrentToGoogleDocs() {
        return this.exportToGoogleDocs();
    }

    async renameGoogleDoc(docId: string, newTitle: string) {
        this.log(`renameGoogleDoc(Legacy) called for ${docId} -> ${newTitle}. Not implemented.`, 'warn');
        return true;
    }

    // --- Gems CRUD ---

    async createGem(options: { name: string, instructions: string, files?: string[] }) {
        return actions.createGemAction(this.ctx, this.deps as GeminiActionDeps, options);
    }

    async updateGem(id: string, options: { name?: string, instructions?: string, files?: string[] }) {
        return actions.updateGemAction(this.ctx, this.deps as GeminiActionDeps, id, options);
    }

    async deleteGem(id: string) {
        return actions.deleteGemAction(this.ctx, this.deps as GeminiActionDeps, id);
    }

    async openGem(nameOrId: string) {
        return actions.openGemAction(this.ctx, this.deps as GeminiActionDeps, nameOrId);
    }

    async chatWithGem(nameOrId: string, message: string) {
        return actions.chatWithGemAction(this.ctx, this.deps as GeminiActionDeps, nameOrId, message);
    }

    // --- Scraping & Research ---

    async scrapeConversations(limit?: number, offset?: number, cb?: (data: any) => void) {
        return actions.scrapeConversationsAction(this.ctx, this.deps as GeminiActionDeps, limit, offset, cb);
    }

    async extractCurrentConversation() {
        return actions.extractCurrentConversationAction(this.ctx, this.deps as GeminiActionDeps);
    }

    async openSession(identifier: string) {
        return this.init(identifier);
    }

    async listDeepResearchDocuments(limit?: number) {
        return actions.listDeepResearchDocsAction(this.ctx, this.deps as GeminiActionDeps, limit);
    }

    async getAllResearchDocsInSession() {
        return actions.getAllResearchDocsInSessionAction(this.ctx, this.deps as GeminiActionDeps);
    }

    // --- Utilities ---

    async uploadFile(filePath: string) {
        return this.uploadFiles([filePath]);
    }

    async goto(url: string) {
        return this.page.goto(url);
    }

    async wait(ms: number) {
        return this.page.waitForTimeout(ms);
    }

    // --- Legacy Bridge & Helpers ---

    async checkAuth() {
        try { await this.ensureSidebar(); return true; } catch (e) { return false; }
    }

    private getCurrentSessionIdSync() {
        const url = this.page.url();
        if (url.includes('/app/')) return url.split('/app/')[1].split('?')[0];
        return null;
    }

    async getCurrentSessionId() {
        return this.getCurrentSessionIdSync();
    }

    async getLatestResponse() { return (await this.extractResponse())?.text || null; }
    async getLatestResponseData() { return this.extractResponse(); }

    // --- Legacy Compatibility ---

    /**
     * Legacy method to get all response texts.
     */
    async getResponses(): Promise<string[]> {
        const data = await actions.extractAllResponsesAction(this.ctx, this.deps as GeminiActionDeps);
        return data.map(d => d.text);
    }

    /**
     * Legacy method to get a response by index.
     * Uses 1-based indexing for positive values (1 = first), 
     * and 0-based negative indexing for relative to end (-1 = latest).
     * @param index 1 for first, -1 for latest. Passing 0 is invalid and will return null.
     */
    async getResponse(index: number): Promise<string | null> {
        if (index === 0) return null; // 0 is invalid in this 1-based convention
        const targetIndex = index > 0 ? index - 1 : index;
        const data = await actions.extractResponseAction(this.ctx, this.deps as GeminiActionDeps, undefined, targetIndex);
        return data ? data.text : null;
    }
}
