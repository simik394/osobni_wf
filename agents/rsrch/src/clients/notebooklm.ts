import { Page } from 'playwright';
import { config } from '../config';
import { selectors } from '../selectors';
import { UniversalContext, NotebookLMActionDeps } from '../actions/types';
import * as actions from '../actions';

/**
 * NotebookLMClient is a lightweight wrapper around granular action modules.
 * It provides a class-based interface for legacy compatibility while
 * delegating all actual logic to stateless, modular actions.
 */
export class NotebookLMClient {
    public page: Page;
    private ctx: UniversalContext;
    private deps: NotebookLMActionDeps & { humanDelay: (ms: number) => Promise<void> };
    private _isBusy: boolean = false;

    constructor(page: Page) {
        this.page = page;
        this.ctx = {
            page,
            log: (msg: string, level?: 'info' | 'warn' | 'error') => {
                const prefix = level === 'error' ? '❌ ' : level === 'warn' ? '⚠️ ' : 'ℹ️ ';
                console.log(`${prefix}[NotebookLM] ${msg}`);
            },
            config
        };
        this.deps = {
            selectors,
            humanDelay: (ms: number) => page.waitForTimeout(ms),
            setIsBusy: (busy: boolean) => { this._isBusy = busy; },
            getIsBusy: () => this._isBusy,
            enqueueTask: async <T>(name: string, task: () => Promise<T>) => {
                this.ctx.log(`[Queue] Running task: ${name}`);
                return task();
            },
            
            // Bridge methods for orchestrator actions
            openNotebook: async (title: string) => this.openNotebook(title),
            recycle: async () => this.recycle(),
            maximizeStudio: async () => actions.maximizeStudioAction(this.ctx, this.deps),
            getAudioArtifactTitles: async () => {
                const artifacts = await actions.getStudioArtifactsAction(this.ctx, this.deps);
                return artifacts.filter(a => a.type === 'audio').map(a => a.title);
            },
            selectSources: async (sources: string[] | string) => {
                await actions.selectSourcesAction(this.ctx, this.deps, sources);
            },
            triggerAudioGeneration: async (prompt?: string, dry?: boolean) => {
                return actions.triggerAudioGenerationAction(this.ctx, this.deps, prompt, dry);
            },
            waitForGeneration: async () => {
                await actions.waitForAudioGenerationAction(this.ctx, this.deps);
            },
            renameArtifact: async (old: string, newT: string) => {
                return actions.renameStudioArtifactAction(this.ctx, this.deps, old, newT);
            },
            archiveNotebook: async (options: { outputDir?: string, format?: 'md' | 'qmd', extractSources?: boolean, incremental?: boolean }) => {
                // We need a title here, but the interface might not provide it easily if it's called from deps
                // For now, use empty string if unknown, archival will fail gracefully or we'll fix later
                return actions.archiveNotebookAction(this.ctx, this.deps, '', options);
            },
            renameNotebook: async (old: string, newT: string) => {
                return actions.renameNotebookAction(this.ctx, this.deps, old, newT);
            },
            deleteNotebook: async (title: string) => {
                return actions.deleteNotebookAction(this.ctx, this.deps, title);
            }
        };

    }

    /** Returns if the client is currently performing a long-running action */
    get isBusy(): boolean {
        return this._isBusy;
    }

    /** Helper for waiting outside actions */
    async humanDelay(ms: number) {
        await this.page.waitForTimeout(ms);
    }

    /** Dumps the current page state (HTML/Screenshot) for debugging */
    async dumpState(name: string) {
        // Ensure deps has dumpState if needed, or use a local helper
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

    // --- Navigation & Lifecycle ---

    /** Navigates back to the NotebookLM home page */
    async recycle() {
        await actions.recycleAction(this.ctx, this.deps);
    }

    /** Opens a notebook by title */
    async openNotebook(title: string) {
        await actions.openNotebookAction(this.ctx, this.deps, title);
    }

    // --- Notebook Management ---

    /** Lists all notebooks on the home page */
    async listNotebooks() {
        return actions.listNotebooksAction(this.ctx, this.deps);
    }

    /** Creates a new notebook with the given title */
    async createNotebook(title: string) {
        return actions.createNotebookAction(this.ctx, this.deps, title);
    }

    /** Renames a notebook from the home page */
    async renameNotebook(oldTitle: string, newTitle: string) {
        return actions.renameNotebookAction(this.ctx, this.deps, oldTitle, newTitle);
    }

    /** Deletes a notebook from the home page */
    async deleteNotebook(title: string) {
        return actions.deleteNotebookAction(this.ctx, this.deps, title);
    }

    // --- Source Management ---

    /** Gets all sources in the currently open notebook */
    async getSources() {
        return actions.getSourcesAction(this.ctx, this.deps);
    }

    /** Gets all sources with a text snippet preview */
    async getSourcesPreview(indices?: number[]) {
        return actions.getSourcesPreviewAction(this.ctx, this.deps, indices);
    }

    /** Deletes a source by title */
    async deleteSource(title: string) {
        return actions.deleteSourceAction(this.ctx, this.deps, title);
    }

    /** Renames a source */
    async renameSource(oldTitle: string, newTitle: string) {
        return actions.renameSourceAction(this.ctx, this.deps, oldTitle, newTitle);
    }

    /** Selects specific sources for grounding */
    async selectSources(sources: string[] | string) {
        return actions.selectSourcesAction(this.ctx, this.deps, sources);
    }

    /** Uploads local files as sources */
    async uploadLocalFile(filePath: string | string[]) {
        return actions.uploadLocalFileAction(this.ctx, this.deps, filePath);
    }

    /** Adds a source URL */
    async addSourceUrl(url: string) {
        return actions.addSourceUrlAction(this.ctx, this.deps, url);
    }

    /** Adds a source text */
    async addSourceText(text: string, title?: string, notebookTitle?: string) {
        return actions.addTextSourceAction(this.ctx, this.deps, text, { title, notebookTitle });
    }

    /** Adds sources from Google Drive */
    async addSourceFromDrive(docNames: string[], notebookTitle?: string) {
        return actions.addDriveSourceAction(this.ctx, this.deps, docNames);
    }

    // --- Query & Chat ---

    /** Sends a query to the chat and returns the response */
    async query(message: string, options: { sources?: string[] } = {}) {
        if (options.sources) {
            await this.selectSources(options.sources);
        }
        return actions.queryNotebookAction(this.ctx, this.deps, message);
    }

    /** Retrieves chat history for the current notebook */
    async getChatMessages() {
        return actions.getChatMessagesAction(this.ctx, this.deps);
    }

    // --- Studio & Artifacts ---

    /** Retrieves all studio-panel artifacts */
    async getStudioArtifacts() {
        return actions.getStudioArtifactsAction(this.ctx, this.deps);
    }

    /** Downloads audio preview to local disk */
    async downloadAudio(notebookTitle: string, outputPath: string, options: { latestOnly?: boolean; audioTitlePattern?: string } = {}) {
        return actions.downloadAudioAction(this.ctx, this.deps, notebookTitle, outputPath, options);
    }

    /** Legacy download with full audio support */
    async downloadAllAudio(notebookTitle: string, outputDir: string, options: { limit?: number } = {}) {
        // Simple bridge to downloadAudioAction for now
        return actions.downloadAudioAction(this.ctx, this.deps, notebookTitle, `${outputDir}/audio_${Date.now()}.mp3`, { latestOnly: !!options.limit });
    }

    // --- Sync & Scrape ---

    /** Scrapes full notebook data for synchronization */
    async scrapeNotebook(title: string, downloadAudio: boolean = false, downloadOptions?: { outputDir?: string, filename?: string }) {
        return actions.scrapeNotebookAction(this.ctx, this.deps, title, { 
            downloadAudio, 
            outputDir: downloadOptions?.outputDir, 
            filename: downloadOptions?.filename 
        });
    }

    /** Retrieves notebook statistics */
    async getNotebookStats(notebookTitle: string) {
        // Open the notebook first
        await this.openNotebook(notebookTitle);
        const sources = await this.getSources();
        const messages = await this.getChatMessages();
        const artifacts = await this.getStudioArtifacts();
        const audioCount = artifacts.filter(a => a.type === 'audio').length;

        return {
            title: notebookTitle,
            sources: sources.length,
            messages: messages.length,
            artifacts: artifacts.length,
            audioCount
        };
    }

    /** Legacy audio status check */
    async checkAudioStatus(notebookTitle: string) {
        await this.openNotebook(notebookTitle);
        const artifacts = await this.getStudioArtifacts();
        const audio = artifacts.find(a => a.type === 'audio');
        return {
            hasAudio: !!audio,
            title: audio?.title,
            details: audio?.details
        };
    }

    /** Downloads a specific artifact (text, note, etc.) */
    async downloadArtifact(notebookTitle: string, artifactTitle: string, outputPath: string, options: { isPattern?: boolean, latestOnly?: boolean } = {}) {
        return actions.downloadArtifactAction(this.ctx, this.deps, notebookTitle, artifactTitle, outputPath, options);
    }

    /** Generates a slide deck (presentation) */
    async generatePresentation(options: { sources?: string[] } = {}) {
        return actions.generatePresentationAction(this.ctx, this.deps, options);
    }

    /** Generates an infographic */
    async generateInfographic(options: { sources?: string[] } = {}) {
        return actions.generateInfographicAction(this.ctx, this.deps, options);
    }

    /** Generates an audio overview for the notebook */
    async generateAudioOverview(notebookTitle: string, sources?: string[], prompt?: string, wet: boolean = false, dryRun: boolean = false) {
        return actions.generateAudioOverviewAction(this.ctx, { 
            notebookTitle, 
            sources, 
            customPrompt: prompt, 
            waitForCompletion: wet, 
            dryRun 
        }, this.deps);
    }

    /** Checks if audio is being generated or is already present */
    async getAudioStatus(notebookTitle?: string) {
        if (notebookTitle) await this.openNotebook(notebookTitle);
        return actions.getAudioGenerationStatusAction(this.ctx, this.deps);
    }

    /** Renames an artifact in the studio panel */
    async renameArtifact(oldTitle: string, newTitle: string) {
        return actions.renameStudioArtifactAction(this.ctx, this.deps, oldTitle, newTitle);
    }
    
    /** Archives a full NotebookLM notebook locally */
    async archiveNotebook(notebookTitle: string, options: { outputDir?: string, format?: 'md' | 'qmd', extractSources?: boolean, incremental?: boolean } = {}) {
        return actions.archiveNotebookAction(this.ctx, this.deps, notebookTitle, options);
    }

    /** Downloads a single source by title */
    async downloadSource(title: string, outputDir: string, format: 'md' | 'qmd' = 'md') {
        return actions.downloadSourceAction(this.ctx, this.deps, title, outputDir, format);
    }
}

