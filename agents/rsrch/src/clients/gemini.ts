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

        this.deps = {
            selectors,
            telemetry,
            verbose: this.verbose,
            getGraphStore: () => getGraphStore(),
            checkAuth: async () => { try { await this.ensureSidebar(); return true; } catch(e) { return false; } },
            getCurrentSessionId: () => this.getCurrentSessionIdSync(),
            getLatestResponseData: async () => await this.extractResponse(),
            getLatestResponse: async () => (await this.extractResponse())?.text || null,
            injectText: async (text: string) => { 
                const input = this.page.locator(selectors.gemini.chat.input).first();
                if (await input.isVisible()) {
                    await input.click();
                }
                await this.page.fill(selectors.gemini.chat.input, text); 
            },
            injectSources: async (sources: any[]) => { this.log('injectSources not implemented in bridge (legacy)', 'warn'); },
            
            setModel: async (model: string) => { await actions.setModelAction(this.ctx, this.deps as GeminiActionDeps, model); return true; },
            resetToNewChat: async () => { await actions.resetToNewChatAction(this.ctx, this.deps as GeminiActionDeps); },
            
            uploadFiles: async (files: string[]) => { await actions.uploadFilesAction(this.ctx, this.deps as GeminiActionDeps, files); return true; },
            recycle: async () => {
                const { BrowserClient } = await import('./base');
                const b = new BrowserClient();
                await b.init({ profileId: 'default' });
                
                if ((b as any).recycleTabPage) await (b as any).recycleTabPage('gemini');
                if (b.release) await b.release();
            },
            dumpState: async (name: string) => await this.dumpState(name)
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

    // --- Session & State ---

    async resetToNewChat() {
        return actions.resetToNewChatAction(this.ctx, this.deps as GeminiActionDeps);
    }

    async listSessions(options: { limit?: number, offset?: number } = {}) {
        return actions.listSessionsAction(this.ctx, this.deps as GeminiActionDeps, options);
    }

    async setModel(model: string) {
        return actions.setModelAction(this.ctx, this.deps as GeminiActionDeps, model);
    }

    async ensureSidebar() {
        return actions.ensureSidebarAction(this.ctx, this.deps as GeminiActionDeps);
    }

    async init(sessionId?: string) {
        if (sessionId) {
            await this.page.goto(`${config.urls.gemini}/app/${sessionId}`);
            await this.ensureSidebar();
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
            googleDocUrl: exportRes.docUrl,
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
     * In the modular version, we just return the latest one in an array for compatibility.
     */
    async getResponses(): Promise<string[]> {
        const data = await this.extractResponse();
        return data ? [data.text] : [];
    }

    /**
     * Legacy method to get a response by index.
     */
    async getResponse(index: number): Promise<string | null> {
        const responses = await this.getResponses();
        if (index < 0) index = responses.length + index;
        return responses[index] || null;
    }
}
