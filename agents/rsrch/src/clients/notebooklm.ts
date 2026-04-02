// @ts-nocheck
import { Page } from 'playwright';
import * as path from 'path';
import * as fs from 'fs';
import { config } from '../config';
import { injectSharedObserver } from '../../../shared/src/dom-observer';
import { selectors } from '../selectors';
import { 
    createNotebookAction,
    queryNotebookAction,
    openNotebookAction,
    addSourceUrlAction,
    addSourceTextAction,
    addSourceFromDriveAction,
    selectSourcesAction,
    uploadLocalFileAction,
    generateAudioOverviewAction
} from '../actions';


export class NotebookLMClient {
    public isBusy: boolean = false;
    private verbose: boolean = false;

    constructor(public page: Page, options: { verbose?: boolean } = {}) {
        this.verbose = options.verbose || false;
    }

    private log(message: string) {
        if (this.verbose) {
            console.log(`[NotebookLM] ${message}`);
        }
    }

    private getContext(): any {
        return {
            page: this.page,
            log: (msg: string) => this.log(msg),
            config,
        };
    }

    /**
     * Humanized delay with randomization for anti-detection.
     * @param baseMs Base delay in milliseconds
     * @param variance Variance percentage (default 0.3 = ±30%)
     */
    private async humanDelay(baseMs: number, variance: number = 0.3): Promise<void> {
        const min = Math.floor(baseMs * (1 - variance));
        const max = Math.floor(baseMs * (1 + variance));
        const delay = Math.floor(Math.random() * (max - min + 1)) + min;
        await this.page.waitForTimeout(delay);
    }

    async init() {
        const currentUrl = this.page.url();
        if (currentUrl.includes('notebooklm.google.com') && !currentUrl.includes('/notebook/')) {
            this.log('Already on home page, skipping init navigation');
            return;
        }
        
        if (currentUrl.includes('notebooklm.google.com')) {
            this.log('On different page, recycling to home...');
            await this.recycle();
        } else {
            await this.page.goto(config.urls.notebooklm, { waitUntil: 'domcontentloaded' });
        }
    }

    /**
     * Recycle the current tab back to the home page (notebook list) using UI navigation.
     * Essential for absolute efficiency as mandated.
     */
    async recycle() {
        this.log('Recycling NotebookLM tab via UI...');
        const homeBtn = this.page.locator('a[href="/"], .notebook-logo, [aria-label*="NotebookLM"]').first();
        if (await homeBtn.count() > 0 && await homeBtn.isVisible()) {
            await homeBtn.click();
            try {
                await this.page.waitForURL(url => url.href.includes('notebooklm.google.com') && !url.href.includes('/notebook/'), { timeout: 5000 });
                this.log('Recycled successfully via UI.');
            } catch (e) {
                this.log('UI recycle timed out, falling back to goto().');
                await this.page.goto(config.urls.notebooklm, { waitUntil: 'domcontentloaded' });
            }
        } else {
            this.log('Home button not found, falling back to goto().');
            await this.page.goto(config.urls.notebooklm, { waitUntil: 'domcontentloaded' });
        }
    }

    async createNotebook(title: string) {
        return createNotebookAction(
            this.getContext(),
            title,
            { selectors, dumpState: (prefix) => this.dumpState(prefix) }
        );
    }

    async dumpState(prefix: string = 'debug') {
        const timestamp = Date.now();
        const dataDir = '/tmp/rsrch_data';
        if (!require('fs').existsSync(dataDir)) {
            require('fs').mkdirSync(dataDir, { recursive: true });
        }
        const htmlPath = path.join(dataDir, `${prefix}_${timestamp}.html`);
        const pngPath = path.join(dataDir, `${prefix}_${timestamp}.png`);

        try {
            console.log(`[NotebookLM] Dumping state to ${htmlPath} / ${pngPath}`);
            const html = await this.page.evaluate(() => document.body.outerHTML);
            const fs = require('fs');
            fs.writeFileSync(htmlPath, html);
            await this.page.screenshot({ path: pngPath, fullPage: true });
            return { htmlPath, pngPath };
        } catch (e) {
            console.error('[NotebookLM] Failed to dump state:', e);
            // Don't throw here to avoid masking original error
        }
    }

    async query(message: string): Promise<string> {
        return queryNotebookAction(
            this.getContext(),
            { 
                selectors, 
                humanDelay: (ms: number) => this.humanDelay(ms) 
            },
            message
        );
    }

    private async notifyDiscord(message: string, isError: boolean = false) {
        const { discordService } = await import('../services/notification');
        await discordService.sendNotification(message, {
            title: isError ? 'NotebookLM Error' : 'NotebookLM Notification',
            priority: isError ? 'high' : 'default'
        });
    }


    async openNotebook(title: string) {
        return openNotebookAction(
            this.getContext(),
            { selectors, humanDelay: (ms: number) => this.humanDelay(ms) },
            title
        );
    }

    async addSourceUrl(urlStr: string) {
        return addSourceUrlAction(
            this.getContext(),
            urlStr,
            { selectors, humanDelay: (ms: number) => this.humanDelay(ms) }
        );
    }

    /**
     * Add a source by pasting text directly (for scraped markdown content).
     * This bypasses Google Docs and directly imports content into NotebookLM.
     * 
     * @param text The text/markdown content to paste as a source
     * @param title Optional title for the pasted text source
     * @param notebookTitle Optional notebook to open first
     */
    async addSourceText(text: string, title?: string, notebookTitle?: string) {
        return addSourceTextAction(
            this.getContext(),
            text,
            title,
            notebookTitle,
            {
                openNotebook: (title: string) => this.openNotebook(title),
                humanDelay: (baseMs: number, variance?: number) => this.humanDelay(baseMs, variance),
            }
        );
    }

    /**
     * Add sources from Google Drive by document name or ID.
     * @param docNames Array of document names (or partial names) to search for and select
     * @param notebookTitle Optional notebook to open first
     */
    async addSourceFromDrive(docNames: string[], notebookTitle?: string) {
        return addSourceFromDriveAction(
            this.getContext(),
            docNames,
            notebookTitle,
            {
                openNotebook: (title) => this.openNotebook(title),
                humanDelay: (baseMs: number, variance?: number) => this.humanDelay(baseMs, variance)
            }
        );
    }

    async uploadLocalFile(filePath: string | string[]) {
        return uploadLocalFileAction(
            this.getContext(),
            { 
                selectors, 
                humanDelay: (baseMs: number, variance?: number) => this.humanDelay(baseMs, variance) 
            },
            filePath
        );
    }

    private taskQueue: Promise<any> = Promise.resolve();

    /**
     * Enqueue a task to be executed serially.
     */
    private enqueueTask<T>(taskName: string, task: () => Promise<T>): Promise<T> {
        console.log(`[TaskQueue] Enqueueing task: ${taskName}`);
        const nextTask = this.taskQueue.then(async () => {
            console.log(`[TaskQueue] Starting task: ${taskName}`);
            try {
                return await task();
            } catch (e) {
                console.error(`[TaskQueue] Task failed: ${taskName}`, e);
                throw e;
            } finally {
                console.log(`[TaskQueue] Finished task: ${taskName}`);
            }
        });

        // Catch errors to prevent queue blockage, but allow the caller to await the result
        this.taskQueue = nextTask.catch(() => { });
        return nextTask;
    }

    async generateAudioOverview(notebookTitle?: string, sources?: string[], customPrompt?: string, waitForCompletion: boolean = false, dryRun: boolean = false): Promise<{ success: boolean; artifactTitle?: string }> {
        return generateAudioOverviewAction(
            this.getContext(),
            { notebookTitle, sources, customPrompt, waitForCompletion, dryRun },
            {
                humanDelay: (baseMs: number, variance?: number) => this.humanDelay(baseMs, variance),
                enqueueTask: (name, task) => this.enqueueTask(name, task),
                setIsBusy: (busy) => { this.isBusy = busy; },
                getIsBusy: () => this.isBusy,
                openNotebook: (title) => this.openNotebook(title),
                getAudioArtifactTitles: () => this.getAudioArtifactTitles(),
                selectSources: (sources) => this.selectSources(sources),
                maximizeStudio: () => this.maximizeStudio(),
                triggerAudioGeneration: (prompt, dry, title) => this.triggerAudioGeneration(prompt, dry ?? false, title),
                waitForGeneration: () => this.waitForGeneration(),
                renameArtifact: (old, newT) => this.renameArtifact(old, newT),
                humanDelay: (baseMs: number, variance?: number) => this.humanDelay(baseMs, variance),
            }
        );
    }

    private async getAudioArtifactTitles(): Promise<string[]> {
        // Ensure the list is visible
        await this.maximizeStudio();
        await this.humanDelay(500);

        const results: string[] = [];

        // From DOM inspection: audio artifacts are button.artifact-button-content
        // containing mat-icon with text 'audio_magic_eraser'
        const artifactButtons = this.page.locator('button.artifact-button-content');
        const count = await artifactButtons.count();
        console.log(`[DEBUG] Found ${count} artifact buttons in Studio`);

        for (let i = 0; i < count; i++) {
            const button = artifactButtons.nth(i);

            // Check if this is an audio artifact (has mat-icon with audio_magic_eraser)
            const icon = await button.locator('mat-icon').first().innerText().catch(() => '');
            const iconTrimmed = icon.trim().toLowerCase();
            console.log(`[DEBUG] Button ${i}: icon="${iconTrimmed}"`);

            // Match audio by icon (audio_magic_eraser) or if icon contains 'audio'
            if (!iconTrimmed.includes('audio')) {
                continue; // Skip non-audio artifacts
            }

            // Extract title - first div > span
            const titleSpan = button.locator('div span').first();
            const title = await titleSpan.innerText().catch(() => '');

            // Extract metadata (source count) - look for "X zdroj" 
            const fullText = await button.innerText().catch(() => '');
            const sourceMatch = fullText.match(/(\d+)\s*zdroj/);
            const sourceCount = sourceMatch ? parseInt(sourceMatch[1]) : 0;

            if (title && title.length > 3) {
                results.push(`${title.substring(0, 80).trim()}|${sourceCount}`);
                console.log(`[DEBUG] Audio: "${title.substring(0, 40)}..." (${sourceCount} sources)`);
            }
        }

        console.log(`[DEBUG] Found ${results.length} audio artifacts`);
        return results;
    }

    async checkAudioStatus(notebookTitle?: string): Promise<{ generating: boolean; artifactTitles: string[] }> {
        return this.enqueueTask(`Check Audio Status: ${notebookTitle || 'Current'}`, async () => {
            if (notebookTitle) {
                await this.openNotebook(notebookTitle);
            }

            await this.maximizeStudio();
            await this.humanDelay(500);

            // Check if it is still generating - look for "Generování" text anywhere in Studio
            const generatingLocator = this.page.locator('body').filter({ hasText: /Generování|Generating/i });
            const generating = await generatingLocator.count() > 0;
            console.log(`[DEBUG] Generation in progress: ${generating}`);

            // Get all current audio artifact titles
            const artifactTitles = await this.getAudioArtifactTitles();
            console.log(`[DEBUG] Found ${artifactTitles.length} audio artifacts`);

            return {
                generating,
                artifactTitles
            };
        });
    }

    /**
     * Rename an artifact in the Studio panel.
     * @param currentTitle The current title to search for
     * @param newTitle The new title to set
     */
    public async renameArtifact(currentTitle: string, newTitle: string): Promise<boolean> {
        console.log(`[DEBUG] Renaming artifact "${currentTitle}" to "${newTitle}"...`);

        try {
            // Find the item
            const item = this.page.locator('artifact-library-item').filter({ has: this.page.locator('.artifact-title', { hasText: currentTitle }) }).first();
            if (await item.count() === 0) {
                console.warn(`[DEBUG] Could not find artifact to rename: ${currentTitle}`);
                return false;
            }

            // Open menu
            const menuBtn = item.locator('button[aria-label*="More"], button[aria-label*="Další"], button mat-icon:has-text("more_vert")').first();
            await menuBtn.click();

            // Click Rename
            const renameOption = this.page.locator('button[role="menuitem"]').filter({ hasText: /Rename|Přejmenovat/i }).first();
            if (await renameOption.count() === 0) {
                console.warn('[DEBUG] Rename option not found in menu.');
                await this.page.keyboard.press('Escape');
                return false;
            }
            await renameOption.click();

            // Wait for input
            const input = this.page.locator('input[type="text"].rename-input, mat-dialog-container input').first();
            await input.fill(newTitle);
            await this.page.keyboard.press('Enter');

            await this.page.waitForTimeout(1000);
            console.log('[DEBUG] Rename complete.');
            return true;
        } catch (e) {
            console.error('[NotebookLM] Failed to rename artifact:', e);
            return false;
        }
    }

    /**
     * Parse a range string into an array of 1-based indices.
     * Supports formats like "1,3,5-8", "1-10,!4,!7", etc.
     */
    private parseIndexRanges(rangeStr: string, maxItems: number): number[] {
        const selected = new Set<number>();
        const excluded = new Set<number>();

        const parts = rangeStr.split(',').map(s => s.trim());
        for (const part of parts) {
            if (part.startsWith('!')) {
                // Exclusion
                const num = parseInt(part.substring(1));
                if (!isNaN(num)) excluded.add(num);
            } else if (part.includes('-')) {
                // Range
                const [startStr, endStr] = part.split('-');
                const start = parseInt(startStr);
                const end = parseInt(endStr);
                if (!isNaN(start) && !isNaN(end)) {
                    for (let i = start; i <= end; i++) {
                        if (i >= 1 && i <= maxItems) selected.add(i);
                    }
                }
            } else {
                // Single number
                const num = parseInt(part);
                if (!isNaN(num) && num >= 1 && num <= maxItems) selected.add(num);
            }
        }

        // Remove excluded
        for (const ex of excluded) {
            selected.delete(ex);
        }

        return Array.from(selected).sort((a, b) => a - b);
    }

    /**
     * Select specific sources. If the sources argument looks like an index range
     * (e.g. "1,3,5-8"), it resolves the indices based on the current order in the UI.
     * If an array of names is provided, it tries to match by title.
     */
    public async selectSources(sources: string[] | string) {
        return selectSourcesAction(
            this.getContext(),
            {
                selectors,
                humanDelay: (baseMs: number, variance?: number) => this.humanDelay(baseMs, variance),
            },
            sources
        );
    }

    private async triggerAudioGeneration(customPrompt: string | undefined, dryRun: boolean, notebookTitle?: string): Promise<boolean> {
        console.log(`[DEBUG] Triggering audio generation... customPrompt: ${customPrompt ? customPrompt.substring(0, 50) + '...' : 'none'}`);

        if (dryRun) {
            console.log('[DEBUG] Dry run mode - skipping actual generation trigger');
            return true;
        }

        // If we have a custom prompt, we MUST click the customize pencil button first
        // Browser subagent found: button[aria-label="Přizpůsobit audio přehled"]
        if (customPrompt) {
            console.log('[DEBUG] Custom prompt provided, clicking customize button...');
            const customizeBtn = this.page.locator('button[aria-label="Přizpůsobit audio přehled"], button[aria-label="Customize audio overview"]').first();

            if (await customizeBtn.count() > 0 && await customizeBtn.isVisible()) {
                await customizeBtn.click();
                console.log('[DEBUG] Clicked customize button (pencil icon)');
                await this.humanDelay(2000);

                // Find and fill the textarea in the customize dialog
                // Browser subagent found: textarea[aria-label="Textové pole"]
                const textarea = this.page.locator('textarea[aria-label="Textové pole"], textarea[placeholder*="Co byste mohli"]').first();

                if (await textarea.count() > 0 && await textarea.isVisible()) {
                    console.log('[DEBUG] Found customize textarea, filling custom prompt...');
                    await textarea.fill('');
                    await textarea.fill(customPrompt);
                    console.log('[DEBUG] Custom prompt filled');
                    await this.humanDelay(500);
                } else {
                    console.warn('[DEBUG] Customize dialog textarea not found');
                }

                // Click Generate button in dialog - wait for it to appear
                await this.humanDelay(500); // Let dialog fully render

                // Try multiple selectors for the generate button
                let generateBtn = this.page.locator('button:has-text("Vygenerovat")').first();
                if (await generateBtn.count() === 0) {
                    generateBtn = this.page.locator('button:has-text("Generate")').first();
                }

                if (await generateBtn.count() > 0 && await generateBtn.isVisible()) {
                    console.log('[DEBUG] Clicking Generate button in customize dialog...');
                    await generateBtn.click();
                    return true;
                } else {
                    console.warn('[DEBUG] Generate button not found in customize dialog');
                }
            } else {
                console.warn('[DEBUG] Customize button not found, falling back to direct generation');
            }
        }

        // Fallback: Click the main Audio přehled button (generates without custom prompt)
        const audioBtn = this.page.locator('[aria-label="Audio přehled"], [aria-label="Audio Overview"], button:has-text("Audio přehled")').first();
        if (await audioBtn.count() > 0 && await audioBtn.isVisible()) {
            console.log('[DEBUG] Clicking main Audio button...');
            await audioBtn.click();
            await this.humanDelay(2000);
            return true;
        }

        console.warn('[DEBUG] Audio generation button not found!');
        return false;
    }

    private async handleGenerationDialog(customPrompt: string | undefined, dryRun: boolean, notebookTitle?: string): Promise<boolean> {
        // This method is kept for backwards compatibility but the logic is now in triggerAudioGeneration
        return true;
    }

    /**
     * Ensure the Studio/Analysis panel is visible (where Audio Overviews live).
     */
    private async maximizeStudio() {
        // Switch to Studio/Notebook Guide tab/button
        // In some locales/UI versions, this is a button "Studio" or "Notebook Guide"
        const studioToggle = this.page.locator('button, [role="button"], div[role="tab"]').filter({
            hasText: /Studio|Notebook Guide|Průvodce sešitem/i
        }).first();

        if (await studioToggle.count() > 0 && await studioToggle.isVisible()) {
            const isSelected = await studioToggle.getAttribute('aria-selected') === 'true';

            // Check if already open by looking for Audio/Overview header text
            const hasAudioText = await this.page.locator('body').filter({ hasText: /Audio (Overview|přehled)/i }).count() > 0;

            if (!hasAudioText && !isSelected) {
                console.log(`[NotebookLM] Clicking Studio/Analysis toggle: "${await studioToggle.innerText()}"`);
                await studioToggle.click();
                await this.humanDelay(1500);
            }
        } else {
            // It might be already open or different UI, log warning but proceed
            console.log('[NotebookLM] Warning: Studio/Analysis toggle not found.');
        }
    }

    /**
     * Wait for audio generation to complete using the shared DOM observer.
     */
    async waitForGeneration(timeoutMs = 600000) {
        this.log('Waiting for generation completion (reactive)...');
        await injectSharedObserver(this.page, {
            tabId: 'notebooklm_generation',
            completionCriteria: {
                appears: ['button[aria-label*="Download"], button[aria-label*="Stáhnout"], mat-icon:has-text("save_alt")'],
                disappears: ['.loading-indicator, mat-progress-bar, [aria-label*="Generating"], :has-text("Generating")']
            },
            timeoutMs
        });
    }

    /**
     * Download audio using the "Golden Path" - direct binary streaming via RequestContext.
     * This bypasses UI-based download limitations and is much more robust for remote execution.
     */
    async downloadAudioByUrl(url: string, outputFilename: string): Promise<boolean> {
        this.log(`Downloading audio from URL: ${url} to ${outputFilename}`);
        
        const response = await this.page.context().request.get(url);
        if (!response.ok()) {
            throw new Error(`Failed to download audio: ${response.status()} ${response.statusText()}`);
        }

        const buffer = await response.body();
        const dir = path.dirname(outputFilename);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        
        fs.writeFileSync(outputFilename, buffer);
        this.log(`Audio successfully saved to ${outputFilename} (${buffer.length} bytes)`);
        return true;
    }

    async downloadAudio(notebookTitle: string, outputFilename: string, options: { audioTitlePattern?: string, latestOnly?: boolean } = {}) {
        if (notebookTitle) {
            await this.openNotebook(notebookTitle);
        }

        this.log(`Attempting reactive download to: ${outputFilename}`);
        
        // 1. Wait for stability/generation if needed
        await this.waitForGeneration();

        // 2. Find the audio source URL (The "Source of Truth")
        const audioSrc = await this.page.evaluate(() => {
            const audioEl = document.querySelector('audio');
            return audioEl ? audioEl.src : null;
        });

        if (audioSrc && audioSrc.startsWith('blob:')) {
            this.log('Detected blob URL. Falling back to memory extraction...');
            return this.downloadAudioFromMemory(audioSrc, outputFilename);
        } else if (audioSrc) {
            return this.downloadAudioByUrl(audioSrc, outputFilename);
        }

        // 3. Fallback to UI-based menu clicking if no direct URL found
        this.log('No direct audio URL found. Falling back to UI-based discovery...');
        // ... (rest of UI logic could follow, but Golden Path is preferred)
        throw new Error('REACTIVE_DOWNLOAD_FAILED: No audio source detected in DOM');
    }

    /**
     * Extract audio data directly from browser memory (useful for blob: URLs).
     */
    private async downloadAudioFromMemory(blobUrl: string, outputFilename: string): Promise<boolean> {
        this.log(`Extracting audio from memory blob: ${blobUrl}`);
        const buffer = await this.page.evaluate(async (url) => {
            const resp = await fetch(url);
            const blob = await resp.blob();
            const arrayBuffer = await blob.arrayBuffer();
            return Array.from(new Uint8Array(arrayBuffer));
        }, blobUrl);

        const dir = path.dirname(outputFilename);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(outputFilename, Buffer.from(buffer));
        this.log(`Audio extracted from memory to ${outputFilename}`);
        return true;
    }

    /**
     * Download an artifact by title or pattern.
     * Delegates to downloadAudio for audio artifacts, or extracts text for text-based artifacts.
     */
    async downloadArtifact(notebookTitle: string, artifactTitleOrPattern: string, outputPathOrDir: string, options: { isPattern?: boolean, latestOnly?: boolean } = {}): Promise<boolean> {
        if (notebookTitle) {
            await this.openNotebook(notebookTitle);
        }

        console.log(`[DEBUG] Attempting to download artifact matching "${artifactTitleOrPattern}" to: ${outputPathOrDir}`);

        await this.maximizeStudio();
        await this.humanDelay(2000);

        // Fetch all artifacts to find a match
        const artifacts = await this.getStudioArtifacts();
        let target = null;
        let targetIndex = -1;

        if (options.latestOnly && !options.isPattern) {
            // Find the first matching title
            targetIndex = artifacts.findIndex(a => a.title.toLowerCase() === artifactTitleOrPattern.toLowerCase());
        } else if (options.isPattern) {
            const regex = new RegExp(artifactTitleOrPattern, 'i');
            targetIndex = artifacts.findIndex(a => regex.test(a.title));
        } else {
            // Exact match default
            targetIndex = artifacts.findIndex(a => a.title === artifactTitleOrPattern);
        }

        if (targetIndex === -1) {
            // Fallback: try loose matching
            targetIndex = artifacts.findIndex(a => a.title.toLowerCase().includes(artifactTitleOrPattern.toLowerCase()));
            if (targetIndex === -1) {
                console.error(`[DEBUG] Artifact matching "${artifactTitleOrPattern}" not found.`);
                return false;
            }
        }

        target = artifacts[targetIndex];
        console.log(`[DEBUG] Found target artifact: [${target.type}] "${target.title}"`);

        const fs = require('fs');
        const path = require('path');

        switch (target.type) {
            case 'audio': {
                // Determine if outputPathOrDir is a directory or file path
                let isDir = false;
                try {
                    isDir = fs.statSync(outputPathOrDir).isDirectory();
                } catch (e) {
                    // Path doesn't exist, check extension
                    isDir = !path.extname(outputPathOrDir);
                }

                let finalPath = outputPathOrDir;
                if (isDir) {
                    const safeTitle = target.title.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 50);
                    finalPath = path.join(outputPathOrDir, `Audio_${safeTitle}_${Date.now()}.mp3`);
                }

                return await this.downloadAudio(notebookTitle, finalPath, {
                    audioTitlePattern: target.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') // Exact match pattern
                });
            }

            case 'note':
            case 'faq':
            case 'briefing':
            case 'timeline':
            case 'table':
            case 'presentation':
            case 'other': {
                // Ensure Studio is maximized
                await this.maximizeStudio();
                const studioPanel = this.page.locator('section.studio-panel, .studio-panel').first();
                if (await studioPanel.count() === 0) {
                    throw new Error('Studio panel not visible');
                }

                // SPECIAL FLOW for Presentations/Blueprints: Use native "Download PDF" from the Sidebar Menu
                if (target.type === 'presentation' || target.type === 'table') {
                    console.log(`[DEBUG] Target is visual (${target.type}). Attempting Sidebar "More" menu download...`);
                    
                    // Surgical selector for the item and its "More" button
                    const item = studioPanel.locator('.artifact-stretched-button').nth(targetIndex);
                    // The more button is usually an 'artifact-more-button' inside the same container
                    const moreBtn = item.locator('xpath=..').locator('.artifact-more-button, [aria-label*="Možnosti"], [aria-label*="More"]').first();
                    
                    if (await moreBtn.count() > 0) {
                        await moreBtn.scrollIntoViewIfNeeded().catch(() => {});
                        await moreBtn.click();
                        await this.humanDelay(1000);
                        
                        // Look for "Stáhnout dokument PDF" or "Download PDF"
                        const downloadBtn = this.page.locator('button.mat-mdc-menu-item, [role="menuitem"]').filter({ 
                            hasText: /Stáhnout dokument PDF|Download PDF|Stáhnout PowerPoint|Download PowerPoint/i 
                        }).first();
                        
                        if (await downloadBtn.count() > 0 && await downloadBtn.isVisible()) {
                            console.log(`[DEBUG] Found download button in menu: ${await downloadBtn.innerText()}`);
                            const downloadPromise = this.page.waitForEvent('download', { timeout: 30000 });
                            await downloadBtn.click();
                            try {
                                const download = await downloadPromise;
                                let isDir = false;
                                try { isDir = fs.statSync(outputPathOrDir).isDirectory(); } catch(e) { isDir = !path.extname(outputPathOrDir); }
                                
                                const finalPath = isDir ? path.join(outputPathOrDir, download.suggestedFilename()) : outputPathOrDir;
                                await download.saveAs(finalPath);
                                console.log(`[DEBUG] ✅ Downloaded visual artifact to: ${finalPath}`);
                                
                                // Menu usually closes automatically after click
                                return true;
                            } catch (e) {
                                console.error(`[DEBUG] PDF/PPT Download failed: ${e}`);
                                // Fallback to scraping/screenshotting below
                            }
                        } else {
                            console.warn('[DEBUG] Download option not found in sidebar menu. Closing menu...');
                            await this.page.keyboard.press('Escape');
                            await this.humanDelay(500);
                        }
                    }
                }

                // STANDARD FLOW: Open and Scrape
                console.log(`[DEBUG] Attempting to open artifact "${target.title}" (index ${targetIndex})...`);
                const itemLocator = studioPanel.locator('.artifact-stretched-button').nth(targetIndex);
                if (await itemLocator.count() > 0) {
                    await itemLocator.scrollIntoViewIfNeeded().catch(() => {});
                    await itemLocator.click({ force: true }).catch(() => itemLocator.dispatchEvent('click'));
                } else {
                    console.warn(`[DEBUG] Item at index ${targetIndex} not found, trying keyword search...`);
                    await studioPanel.locator('.artifact-stretched-button').filter({ hasText: target.title }).first().click().catch(() => {});
                }
                
                console.log(`[DEBUG] Waiting for artifact content layer...`);
                await this.humanDelay(2500); // Wait for content load

                // Expanded selectors to capture Notes, Presentations, FAQ, Flashcards
                // Added [contenteditable] and specific editor classes
                const contentSelector = '.prose, .note-content, .artifact-content-container, article, note-editor, labs-tailwind-doc-viewer, .flashcard-container, .presentation-container, markdown-viewer, [contenteditable="true"], .ql-editor';
                await this.page.waitForSelector(contentSelector, { timeout: 10000 }).catch(() => {});

                const contentLocators = this.page.locator(contentSelector);
                let textContent = '';
                if (await contentLocators.count() > 0) {
                    // Try to get text from the most specific prominent container
                    textContent = await contentLocators.first().innerText().catch(() => '');
                } 
                
                if (!textContent || textContent.trim().length < 10) {
                    console.log('[DEBUG] Trying fallback text extraction from dialog/side-panel...');
                    textContent = await this.page.locator('mat-dialog-container, .dialog-content, note-editor, .side-panel-content, labs-tailwind-doc-viewer, .artifact-view-container').first().allInnerTexts().then(texts => texts.join('\n')).catch(() => '');
                }

                if (!textContent || textContent.trim().length < 10) {
                    console.log('[DEBUG] Artifact contains no extractable text. Capturing visual screenshot...');
                    
                    let isDir = false;
                    try { isDir = fs.statSync(outputPathOrDir).isDirectory(); } catch(e) { isDir = !path.extname(outputPathOrDir); }

                    if (isDir) {
                        const typePrefix = target.type.charAt(0).toUpperCase() + target.type.slice(1);
                        const safeTitle = target.title.replace(/[^a-zA-Z0-9-_]/g, '_').substring(0, 50);
                        const finalPngPath = path.join(outputPathOrDir, `${typePrefix}_${safeTitle}.png`);
                        
                        const dir = path.dirname(finalPngPath);
                        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
                        
                        // Try to screenshot the inner modal container
                        const container = this.page.locator('.mat-mdc-dialog-container, mat-dialog-container, .dialog-content, note-editor, .side-panel-content, labs-tailwind-doc-viewer').first();
                        if (await container.count() > 0 && await container.isVisible()) {
                            await container.screenshot({ path: finalPngPath });
                        } else {
                            await this.page.screenshot({ path: finalPngPath });
                        }
                        console.log(`[DEBUG] ✅ Saved visual screenshot to: ${finalPngPath}`);
                    }
                } else {
                    // Save text
                    let isDir = false;
                    try { isDir = fs.statSync(outputPathOrDir).isDirectory(); } catch(e) { isDir = !path.extname(outputPathOrDir); }

                    let finalPath = outputPathOrDir;
                    if (isDir) {
                        const typePrefix = target.type.charAt(0).toUpperCase() + target.type.slice(1);
                        const safeTitle = target.title.replace(/[^a-zA-Z0-9-_]/g, '_').substring(0, 50);
                        finalPath = path.join(outputPathOrDir, `${typePrefix}_${safeTitle}.txt`);
                    }

                    const dir = path.dirname(finalPath);
                    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

                    fs.writeFileSync(finalPath, textContent);
                    console.log(`[DEBUG] ✅ Saved text artifact to: ${finalPath}`);
                }

                // Close the modal or view
                const closeBtn = this.page.locator('button[aria-label*="Zavřít"], button[aria-label*="Close"], button mat-icon:has-text("collapse_content"), button mat-icon:has-text("close")').first();
                if (await closeBtn.count() > 0 && await closeBtn.isVisible()) {
                    await closeBtn.click();
                    await this.humanDelay(500);
                } else {
                    await this.page.keyboard.press('Escape');
                }

                return true;
            }

            default: {
                console.warn(`[DEBUG] Unknown artifact type: ${target.type}`);
                return false;
            }
        }
    }

    async downloadAllAudio(notebookTitle: string, outputDir: string, options: { limit?: number } = {}) {
        if (notebookTitle) {
            await this.openNotebook(notebookTitle);
        }

        console.log(`[DEBUG] Downloading ${options.limit ? 'top ' + options.limit : 'ALL'} audio files to directory: ${outputDir}`);

        // Create output directory if it doesn't exist
        const fs = require('fs');
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
            console.log(`[DEBUG] Created output directory: ${outputDir}`);
        }

        // RESPONSIVE UI HANDLING: Check for Studio tab
        // RESPONSIVE UI HANDLING: Check for Studio tab
        await this.maximizeStudio();

        await this.page.waitForTimeout(2000);

        // Find ALL audio artifacts in the library
        console.log('[DEBUG] Searching for all audio artifacts...');
        const audioArtifacts = this.page.locator('button, div[role="button"]').filter({
            hasText: 'audio_magic_eraser'
        }).filter({ hasText: /play_arrow|more_vert/ });

        const count = await audioArtifacts.count();
        console.log(`[DEBUG] Found ${count} audio artifact(s)`);

        if (count === 0) {
            console.warn('[DEBUG] No audio artifacts found in notebook.');
            return [];
        }

        const downloaded = [];

        // Iterate through each audio artifact
        const processCount = options.limit ? Math.min(count, options.limit) : count;

        for (let i = 0; i < processCount; i++) {
            console.log(`\n[DEBUG] === Processing audio ${i + 1} of ${count} ===`);

            const artifact = audioArtifacts.nth(i);

            // Try to get the title of the audio
            let audioTitle = '';
            try {
                const titleEl = artifact.locator('.artifact-title, .title').first();
                if (await titleEl.count() > 0) {
                    audioTitle = await titleEl.innerText();
                    audioTitle = audioTitle.trim().replace(/[^a-zA-Z0-9-_]/g, '_');
                }
            } catch (e) {
                console.warn('[DEBUG] Could not extract title, using index');
            }

            if (!audioTitle) {
                audioTitle = `audio_${i + 1}`;
            }

            const filename = path.join(outputDir, `${audioTitle}_${Date.now()}.mp3`);

            // Check if this audio was already downloaded
            const existingFiles = fs.readdirSync(outputDir).filter((f: string) => f.startsWith(audioTitle));
            if (existingFiles.length > 0) {
                console.log(`[DEBUG] Audio "${audioTitle}" appears to already exist. Skipping.`);
                continue;
            }

            console.log(`[DEBUG] Downloading to: ${filename}`);

            // Scroll into view and hover to reveal controls
            await artifact.scrollIntoViewIfNeeded();
            await artifact.hover();
            await this.page.waitForTimeout(500);

            // Find the "more_vert" menu button for this specific artifact
            // Be very specific - we want ONLY the button, not the parent container
            const menuBtn = artifact.locator('button[aria-label*="More"], button[aria-label*="Další"], button mat-icon:has-text("more_vert")').first();

            if (await menuBtn.count() === 0) {
                console.warn(`[DEBUG] Could not find menu button for audio "${audioTitle}". Skipping.`);
                continue;
            }

            // Click menu button and WAIT for the overlay to appear
            console.log('[DEBUG] Clicking menu button...');
            await menuBtn.click();

            // CRITICAL: Wait for the menu overlay to actually appear
            console.log('[DEBUG] Waiting for menu to open...');
            try {
                await this.page.locator('.cdk-overlay-pane, .mat-mdc-menu-panel').first().waitFor({
                    state: 'visible',
                    timeout: 3000
                });
                console.log('[DEBUG] Menu opened successfully');
            } catch (e) {
                console.warn(`[DEBUG] Menu did not appear for "${audioTitle}". Skipping.`);
                await this.page.keyboard.press('Escape');
                await this.page.waitForTimeout(500);
                continue;
            }

            // Additional wait for menu animation to complete
            await this.page.waitForTimeout(800);

            // Find and click Download option in the popup menu overlay
            console.log('[DEBUG] Searching for Download option in menu...');

            // Try Czech first
            let downloadBtn = this.page.locator('button[role="menuitem"]').filter({ hasText: 'Stáhnout' }).first();
            if (await downloadBtn.count() > 0 && await downloadBtn.isVisible()) {
                console.log('[DEBUG] Found "Stáhnout" option. Clicking...');
            } else {
                // Try icon search
                downloadBtn = this.page.locator('mat-icon').filter({ hasText: 'save_alt' }).locator('xpath=ancestor::button[contains(@role, "menuitem")]').first();
                if (await downloadBtn.count() > 0 && await downloadBtn.isVisible()) {
                    console.log('[DEBUG] Found "save_alt" icon option. Clicking...');
                } else {
                    // Try English
                    downloadBtn = this.page.locator('button[role="menuitem"]').filter({ hasText: /Download/i }).first();
                    if (await downloadBtn.count() > 0 && await downloadBtn.isVisible()) {
                        console.log('[DEBUG] Found "Download" option. Clicking...');
                    } else {
                        console.warn(`[DEBUG] Download button not found for "${audioTitle}". Logging menu content...`);
                        // Debug: log what's in the menu
                        const overlays = this.page.locator('.cdk-overlay-pane, .mat-mdc-menu-panel');
                        if (await overlays.count() > 0) {
                            const texts = await overlays.allInnerTexts();
                            console.log('[DEBUG] Menu content:', texts);
                        }
                        // Close menu and skip
                        await this.page.keyboard.press('Escape');
                        await this.page.waitForTimeout(500);
                        continue;
                    }
                }
            }

            // Set up download listener and click
            try {
                const downloadPromise = this.page.waitForEvent('download', { timeout: 10000 });
                await downloadBtn.click();

                const download = await downloadPromise;
                const downloadPath = await download.path();
                if (downloadPath) {
                    fs.copyFileSync(downloadPath, filename);
                    console.log(`[DEBUG] ✅ Downloaded: ${filename}`);
                    downloaded.push(filename);
                }
            } catch (e) {
                console.error(`[DEBUG] ❌ Download failed for "${audioTitle}":`, e);
            }

            // Close menu if still open
            await this.page.keyboard.press('Escape');
            await this.page.waitForTimeout(500);
        }

        console.log(`\n[DEBUG] === Download Summary ===`);
        console.log(`[DEBUG] Total found: ${count}`);
        console.log(`[DEBUG] Successfully downloaded: ${downloaded.length}`);

        return downloaded;
    }



    // ==========================================
    // SCRAPER METHODS
    // ==========================================

    /**
     * List all notebooks from the home page
     */
    async listNotebooks(): Promise<Array<{
        title: string;
        platformId: string;
        sourceCount: number;
    }>> {
        console.log('[NotebookLM] Listing notebooks...');
        await this.page.goto(config.urls.notebooklm, { waitUntil: 'domcontentloaded' });
        await this.humanDelay(2000);

        const notebooks: Array<{ title: string; platformId: string; sourceCount: number }> = [];

        try {
            // Wait for notebook cards or table rows to load
            await this.page.waitForSelector(`${selectors.home.projectButton}, ${selectors.home.projectCard}`, { timeout: 15000 });

            const cards = this.page.locator(selectors.home.projectButton);
            const count = await cards.count();
            console.log(`[NotebookLM] Found ${count} notebooks`);

            for (let i = 0; i < count; i++) {
                const card = cards.nth(i);

                // Extract title
                const titleEl = card.locator(selectors.home.projectButtonTitle);
                const titleRaw = await titleEl.innerText().catch(() => `Notebook ${i + 1}`);
                const title = titleRaw.replace(/\n+/g, ' ').trim();

                // Extract source count (usually in subtitle like "3 sources" or inside column)
                const subtitleEl = card.locator('.project-button-subtitle, .source-count, .mat-column-numSources');
                const subtitleText = await subtitleEl.innerText().catch(() => '');
                const sourceMatch = subtitleText.match(/(\d+)\s*(sources?|zdrojů?|zdroje?)/i) || subtitleText.match(/^(\d+)$/);
                const sourceCount = sourceMatch ? parseInt(sourceMatch[1]) : 0;

                // Get platformId from data attribute or by clicking
                let platformId = await card.getAttribute('data-project-id') || '';

                if (!platformId) {
                    // Generate ID from title hash if not available
                    platformId = title.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 16);
                }

                notebooks.push({ title: title.trim(), platformId, sourceCount });
            }
        } catch (e: any) {
            console.error('[NotebookLM] Error listing notebooks:', e.message);
            await this.dumpState('list_notebooks_fail');
        }

        return notebooks;
    }

    /**
     * Scrape a notebook's contents (sources, artifacts, optionally download audio)
     */
    async scrapeNotebook(title: string, downloadAudio: boolean = false, downloadOptions?: { outputDir?: string, filename?: string }): Promise<{
        title: string;
        platformId: string;
        sources: Array<{ type: string; title: string; url?: string }>;
        audioOverviews: Array<{ title: string; hasTranscript: boolean }>;
        artifacts: Array<{ type: 'audio' | 'note' | 'faq' | 'briefing' | 'timeline' | 'table' | 'presentation' | 'other'; title: string; details?: string; sourceCount?: number; absoluteTime?: string; id?: string }>;
        messages: Array<{ role: 'user' | 'ai'; contentPreview: string }>;
    }> {
        console.log(`[NotebookLM] Scraping notebook: ${title}`);
        await this.openNotebook(title);
        await this.humanDelay(2000);

        // Get platformId from URL
        const url = this.page.url();
        const idMatch = url.match(/notebook\/([a-zA-Z0-9_-]+)/);
        const platformId = idMatch ? idMatch[1] : title.toLowerCase().replace(/[^a-z0-9]/g, '');

        // Extract sources
        const sources = await this.extractSources();

        // Extract all studio artifacts (includes audio with types)
        const artifacts = await this.getStudioArtifacts();

        // Extract audio overviews for backward compatibility
        const audioOverviews = await this.extractAudioOverviews();

        // Optionally download audio
        if (downloadAudio && audioOverviews.length > 0) {
            // Use custom output directory or default
            const outputDir = downloadOptions?.outputDir || 'data/audio';
            const fs = require('fs');
            if (!fs.existsSync(outputDir)) {
                fs.mkdirSync(outputDir, { recursive: true });
            }

            // Use provided filename if single notebook, or sanitize title
            const filename = downloadOptions?.filename
                ? (downloadOptions.filename.endsWith('.mp3') ? downloadOptions.filename : `${downloadOptions.filename}.mp3`)
                : `${title.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30)}_${Date.now()}.mp3`;

            const outputPath = `${outputDir}/${filename}`;

            try {
                await this.downloadAudio(title, outputPath, { latestOnly: true });
                console.log(`[NotebookLM] Audio downloaded to: ${outputPath}`);
            } catch (e: any) {
                console.error('[NotebookLM] Failed to download audio:', e.message);
            }
        }

        // Extract chat messages
        const messages = await this.getChatMessages();

        return { title, platformId, sources, audioOverviews, artifacts, messages };
    }

    /**
     * Extract sources from current notebook
     */
    private async extractSources(): Promise<Array<{ type: string; title: string; isSelected?: boolean; id?: string; url?: string }>> {
        const sources: Array<{ type: string; title: string; isSelected?: boolean; id?: string; url?: string }> = [];

        try {
            // Switch to Sources tab
            const sourcesTab = this.page.locator('div[role="tab"]').filter({ hasText: /Zdroje|Sources/i }).first();
            if (await sourcesTab.count() > 0 && await sourcesTab.isVisible()) {
                const isSelected = await sourcesTab.getAttribute('aria-selected') === 'true';
                if (!isSelected) {
                    await sourcesTab.click();
                    await this.humanDelay(1000);
                }
            }

            // Find source items
            // Find source items - explicitly target the item container
            const sourceItems = this.page.locator('.single-source-container, source-list-item').filter({
                has: this.page.locator('.source-title, .title, span')
            });

            const count = await sourceItems.count();
            console.log(`[NotebookLM] Found ${count} sources`);

            for (let i = 0; i < count; i++) {
                const item = sourceItems.nth(i);

                // Get title
                const titleEl = item.locator('.source-title, .title').first();
                const title = await titleEl.innerText().catch(() => '');

                // Check selection status
                const checkbox = item.locator('input[type="checkbox"]');
                let isSelected = false;
                if (await checkbox.count() > 0) {
                    isSelected = await checkbox.isChecked().catch(() => false);
                } else {
                    // Alternative checking methods (sometimes the class or aria-checked is used instead of a direct input)
                    const ariaCheckbox = item.locator('[aria-checked="true"]');
                    if (await ariaCheckbox.count() > 0) {
                        isSelected = true;
                    }
                }

                // Determine type from icon or class
                const html = await item.innerHTML().catch(() => '');
                let type = 'unknown';
                if (html.includes('link') || html.includes('web') || html.includes('language')) type = 'url';
                else if (html.includes('drive_spreadsheet')) type = 'gsheet';
                else if (html.includes('drive') || html.includes('doc')) type = 'gdoc';
                else if (html.includes('pdf') || html.includes('picture_as_pdf') || html.includes('drive_pdf')) type = 'pdf';
                else if (html.includes('text') || html.includes('article') || html.includes('markdown')) type = 'text';

                // Attempt to extract an ID from a button if available
                let id = undefined;
                const menuBtn = item.locator('button[id^="source-item-more-button-"]').first();
                if (await menuBtn.count() > 0) {
                    const btnId = await menuBtn.getAttribute('id');
                    if (btnId) {
                        id = btnId.replace('source-item-more-button-', '');
                    }
                }

                if (title.trim()) {
                    sources.push({ type, title: title.trim(), isSelected, id });
                }
            }
        } catch (e: any) {
            console.error('[NotebookLM] Error extracting sources:', e.message);
        }

        return sources;
    }

    /**
     * Extract audio overviews from current notebook
     */
    private async extractAudioOverviews(): Promise<Array<{ title: string; hasTranscript: boolean }>> {
        const audioList: Array<{ title: string; hasTranscript: boolean }> = [];

        try {
            // Switch to Studio/Notebook Guide tab
            await this.maximizeStudio();

            // Find audio artifacts
            // In some UI versions, these are button elements containing the 'audio_magic_eraser' icon text
            // and usually a 'play_arrow' or 'more_vert'.
            const selector = 'button, div[role="button"]';
            // Wait for at least one candidate to appear to avoid race conditions, but don't fail if truly none
            try {
                // We use a short timeout because it might genuinely be empty
                await this.page.waitForSelector(selector, { timeout: 3000, state: 'attached' });
            } catch (e) {
                // Ignore timeout, just means none found quickly
            }

            const audioArtifacts = this.page.locator(selector).filter({
                hasText: 'audio_magic_eraser'
            }).filter({ hasText: /play_arrow|more_vert/ });

            // Give a small grace period for dynamic hydration
            await this.page.waitForTimeout(1000);

            const count = await audioArtifacts.count();
            console.log(`[NotebookLM] Found ${count} audio overviews`);

            for (let i = 0; i < count; i++) {
                const artifact = audioArtifacts.nth(i);
                const text = await artifact.innerText().catch(() => '');

                // Check for transcript indicator
                const hasTranscript = text.toLowerCase().includes('transcript') ||
                    text.toLowerCase().includes('přepis');

                // Extract title (first line usually)
                const titleMatch = text.split('\n')[0] || `Audio ${i + 1}`;

                audioList.push({
                    title: titleMatch.trim(),
                    hasTranscript
                });
            }
        } catch (e: any) {
            console.error('[NotebookLM] Error extracting audio overviews:', e.message);
        }

        return audioList;
    }

    // ==========================================
    // NOTEBOOK MAPPING METHODS
    // ==========================================

    /**
     * Get chat messages from the current notebook
     */
    async getChatMessages(): Promise<Array<{ role: 'user' | 'ai'; contentPreview: string }>> {
        const messages: Array<{ role: 'user' | 'ai'; contentPreview: string }> = [];

        try {
            console.log('[NotebookLM] Extracting chat messages...');

            // Look for message pairs (user + AI response)
            const messagePairs = this.page.locator('.chat-message-pair');
            const pairCount = await messagePairs.count();

            if (pairCount === 0) {
                console.log('[NotebookLM] No chat message pairs found.');
                // Check if we are in empty state
                return messages;
            }

            console.log(`[NotebookLM] Found ${pairCount} message pairs`);

            for (let i = 0; i < pairCount; i++) {
                const pair = messagePairs.nth(i);

                // User Message
                const userMsg = pair.locator('.user-query-container .individual-message, .from-user-container');
                if (await userMsg.count() > 0) {
                    const content = await userMsg.innerText().catch(() => '');
                    if (content) messages.push({ role: 'user', contentPreview: content.trim() });
                }

                // AI Response
                const aiMsg = pair.locator('.response-container .individual-message, .to-user-container, .model-response-container');
                if (await aiMsg.count() > 0) {
                    const content = await aiMsg.innerText().catch(() => '');
                    // Clean up citations (e.g. [1]) if needed, but keeping raw for now is fine
                    if (content) messages.push({ role: 'ai', contentPreview: content.trim() });
                }
            }
        } catch (e: any) {
            console.error('[NotebookLM] Error extracting chat messages:', e.message);
        }

        return messages;
    }

    private parseRelativeDateToAbsolute(relativeStr: string): Date | null {
        if (!relativeStr) return null;
        const now = new Date();

        let match = relativeStr.match(/(?:Před|ago)\s*(\d+)\s*(?:h|hodin|hours?)/i);
        if (!match) match = relativeStr.match(/(\d+)\s*(?:h|hodin|hours?)\s*(?:ago|Před)/i);
        if (match) {
            const hours = parseInt(match[1]);
            now.setHours(now.getHours() - hours);
            return now;
        }

        match = relativeStr.match(/(?:Před|ago)\s*(\d+)\s*(?:min|minutami|minutes?)/i);
        if (!match) match = relativeStr.match(/(\d+)\s*(?:min|minutami|minutes?)\s*(?:ago|Před)/i);
        if (match) {
            const mins = parseInt(match[1]);
            now.setMinutes(now.getMinutes() - mins);
            return now;
        }

        match = relativeStr.match(/(?:Před|ago)\s*(\d+)\s*(?:dny|dní|days?|d)/i);
        if (!match) match = relativeStr.match(/(\d+)\s*(?:dny|dní|days?|d)\s*(?:ago|Před)/i);
        if (match) {
            const days = parseInt(match[1]);
            now.setDate(now.getDate() - days);
            return now;
        }

        return null;
    }

    /**
     * Get all studio artifacts from the current notebook.
     * Must be called after opening a notebook.
     */
    async getStudioArtifacts(): Promise<Array<{ type: 'audio' | 'note' | 'faq' | 'briefing' | 'timeline' | 'table' | 'presentation' | 'other'; title: string; details?: string; sourceCount?: number; absoluteTime?: string; id?: string; }>> {
        const artifacts: Array<{ type: 'audio' | 'note' | 'faq' | 'briefing' | 'timeline' | 'table' | 'presentation' | 'other'; title: string; details?: string; sourceCount?: number; absoluteTime?: string; id?: string; }> = [];

        try {
            console.log('[NotebookLM] Extracting studio artifacts...');
            await this.maximizeStudio().catch(() => {});
            await this.humanDelay(2500);

            // Using the absolute path confirmed by the subagent: div.right-panel (Studio side)
            const studioPanel = this.page.locator('div.right-panel, section.studio-panel, .studio-panel').first();
            if (await studioPanel.count() === 0) {
                console.error('[NotebookLM] Studio panel not found.');
                return [];
            }

            // Artifact items live in .panel-content-scrollable within the right panel.
            const scrollable = studioPanel.locator('div.panel-content-scrollable, .panel-content-scrollable').first();
            const container = (await scrollable.count() > 0) ? scrollable : studioPanel;
            
            const artifactItems = container.locator('.artifact-stretched-button');
            const count = await artifactItems.count();
            console.log(`[NotebookLM] Found ${count} artifact items in studio-panel`);

            for (let i = 0; i < count; i++) {
                const item = artifactItems.nth(i);
                
                // Surgical extraction of title from .artifact-title (discovered via subagent)
                const titleLoc = item.locator('.artifact-title, div.artifact-title').first();
                let titleText = '';
                if (await titleLoc.count() > 0) {
                    titleText = await titleLoc.evaluate(el => (el as HTMLElement).innerText.trim()).catch(() => '');
                }
                
                // Surgical extraction of icon (used for type detection)
                const iconLoc = item.locator('mat-icon, .artifact-icon, .mat-icon').first();
                let iconText = '';
                if (await iconLoc.count() > 0) {
                    iconText = await iconLoc.evaluate(el => (el as HTMLElement).innerText.trim()).catch(() => '');
                }

                // If surgical extraction failed, try a broader approach or fallback
                if (!titleText || titleText.length < 2) {
                    titleText = `Artifact ${i + 1}`;
                }

                if (titleText !== `Artifact ${i + 1}`) {
                    console.log(`[DEBUG] Found artifact ${i}: "${titleText}" (icon: ${iconText})`);
                }

                // Determine type based on icon text
                let type: 'audio' | 'note' | 'faq' | 'briefing' | 'timeline' | 'table' | 'presentation' | 'other' = 'other';
                if (iconText.includes('audio_magic_eraser')) type = 'audio';
                else if (iconText.includes('sticky_note_2') || iconText.includes('description')) type = 'note';
                else if (iconText.includes('help') || titleText.toLowerCase().includes('faq')) type = 'faq';
                else if (iconText.includes('auto_tab_group')) {
                    if (titleText.toLowerCase().includes('faq')) type = 'faq';
                    else type = 'briefing';
                }
                else if (iconText.includes('timeline')) type = 'timeline';
                else if (iconText.includes('table_view')) type = 'table';
                else if (iconText.includes('tablet')) type = 'presentation';
                else if (iconText.includes('subscriptions')) type = 'other';
                else if (iconText.includes('cards_star')) type = 'other';
                else if (iconText.includes('flowchart')) type = 'other';

                // Extract metadata (sources, date) from .artifact-metadata
                let detailsResult = '';
                const metadataLoc = item.locator('.artifact-metadata').first();
                if (await metadataLoc.count() > 0) {
                    detailsResult = (await metadataLoc.innerText().catch(() => '')).trim();
                }

                let sourceCount = undefined;
                let absoluteTime = undefined;
                if (detailsResult) {
                    const sourceMatch = detailsResult.match(/(\d+)\s*zdroj/i) || detailsResult.match(/(\d+)\s*source/i);
                    if (sourceMatch) sourceCount = parseInt(sourceMatch[1]);
                    
                    const parsedTime = (this as any).parseRelativeDateToAbsolute(detailsResult);
                    if (parsedTime) absoluteTime = parsedTime.toISOString();
                }

                // Extract artifact ID from attributes/labels
                let id = undefined;
                const labelSpan = item.locator('.artifact-labels').first();
                if (await labelSpan.count() > 0) {
                    const labelId = await labelSpan.getAttribute('id');
                    if (labelId) id = labelId.replace('artifact-labels-', '').replace('note-labels-', '');
                }

                artifacts.push({
                    type,
                    title: titleText,
                    details: detailsResult,
                    sourceCount,
                    absoluteTime,
                    id
                });
            }
        } catch (e: any) {
            console.error(`[NotebookLM] Error extracting studio artifacts: ${e.message}`);
        }

        return artifacts;
    }

    /**
     * Get notebook statistics: counts of sources, messages, and artifacts.
     * @param notebookTitle The notebook to analyze
     */
    async getNotebookStats(notebookTitle: string): Promise<{
        title: string;
        sources: number;
        messages: number;
        artifacts: number;
        audioCount: number;
    }> {
        console.log(`[NotebookLM] Getting stats for notebook: ${notebookTitle}`);
        await this.openNotebook(notebookTitle);
        await this.humanDelay(2000);

        const sources = await this.extractSources();
        const messages = await this.getChatMessages();
        const artifacts = await this.getStudioArtifacts();

        const audioCount = artifacts.filter(a => a.type === 'audio').length;

        const stats = {
            title: notebookTitle,
            sources: sources.length,
            messages: messages.length,
            artifacts: artifacts.length,
            audioCount
        };

        console.log(`[NotebookLM] Stats: ${JSON.stringify(stats)}`);
        return stats;
    }

    /**
     * Send a message in the notebook chat.
     * @param message The message to send
     * @param waitForResponse Wait for AI response before returning
     */
    async sendMessage(message: string, waitForResponse: boolean = true): Promise<{ sent: boolean; response?: string }> {
        console.log(`[NotebookLM] Sending message: "${message.substring(0, 50)}..."`);

        try {
            // Find chat input
            const chatInput = this.page.locator('textarea.query-box-input');
            if (await chatInput.count() === 0) {
                console.error('[NotebookLM] Chat input not found.');
                return { sent: false };
            }

            // Type message
            await chatInput.fill(message);
            await this.humanDelay(500);

            // Find and click send button
            const sendButton = this.page.locator('button.submit-button');
            if (await sendButton.count() === 0) {
                // Fallback: press Enter
                console.log('[NotebookLM] Send button not found, using Enter key.');
                await this.page.keyboard.press('Enter');
            } else {
                await sendButton.click();
            }

            console.log('[NotebookLM] Message sent.');

            if (!waitForResponse) {
                return { sent: true };
            }

            // Wait for response
            console.log('[NotebookLM] Waiting for AI response...');

            // Look for a loading indicator or new message appearing
            // NotebookLM shows a loading spinner or streaming text
            await this.page.waitForTimeout(2000); // Initial delay

            // Wait for response to stabilize (streaming to complete)
            let lastText = '';
            let stableCount = 0;
            const maxAttempts = 60; // ~30 seconds

            for (let i = 0; i < maxAttempts; i++) {
                // Check for response container - typically the last prose element
                const responseContainers = this.page.locator('.prose, .response-container, .ai-message');
                const count = await responseContainers.count();

                if (count > 0) {
                    const currentText = await responseContainers.last().innerText().catch(() => '');
                    if (currentText && currentText.length > 0) {
                        if (currentText === lastText) {
                            stableCount++;
                            if (stableCount >= 3) {
                                console.log('[NotebookLM] Response stabilized.');
                                return { sent: true, response: currentText };
                            }
                        } else {
                            stableCount = 0;
                            lastText = currentText;
                        }
                    }
                }
                await this.page.waitForTimeout(500);
            }

            console.warn('[NotebookLM] Response wait timed out.');
            return { sent: true, response: lastText || undefined };

        } catch (e: any) {
            console.error('[NotebookLM] Error sending message:', e.message);
            return { sent: false };
        }
    }

    /**
     * Get sources from current notebook (public wrapper)
     */
    async getSources(): Promise<Array<{ type: string; title: string; isSelected?: boolean; id?: string; url?: string }>> {
        return this.extractSources();
    }

    /**
     * Delete a source from the current notebook by title.
     * @param title The title of the source to delete.
     */
    async deleteSource(title: string): Promise<boolean> {
        console.log(`[NotebookLM] Deleting source: "${title}"`);
        try {
            // Find the source item by title
            const item = this.page.locator('.single-source-container, source-list-item').filter({
                has: this.page.locator('.source-title, .title, span', { hasText: title })
            }).first();

            if (await item.count() === 0) {
                console.error(`[NotebookLM] Error: Source "${title}" not found.`);
                return false;
            }

            // Find and click the 'more' options button
            const moreBtn = item.locator('button').filter({
                has: this.page.locator('mat-icon', { hasText: 'more_vert' })
            }).first();

            await moreBtn.click();
            await this.humanDelay(800);

            // Click Delete/Odstranit from the menu
            const deleteOption = this.page.locator('button[role="menuitem"]').filter({
                hasText: /Odstranit|Delete/i
            }).first();

            await deleteOption.click();
            await this.humanDelay(800);

            // Confirm deletion in dialog
            const confirmBtn = this.page.locator('mat-dialog-container button').filter({
                hasText: /Odstranit|Smazat|Delete/i
            }).first();
            
            if (await confirmBtn.count() > 0) {
                await confirmBtn.click();
                await this.humanDelay(1500);
            }

            return true;
        } catch (e: any) {
            console.error(`[NotebookLM] Error deleting source: ${e.message}`);
            return false;
        }
    }

    /**
     * Rename a source from the current notebook by title.
     * @param oldTitle The current title of the source
     * @param newTitle The new title for the source
     */
    async renameSource(oldTitle: string, newTitle: string) {
        console.log(`[NotebookLM] Attempting to rename source: "${oldTitle}" to "${newTitle}"`);

        // Ensure we are on "Sources" tab
        const sourcesTab = this.page.locator('div[role="tab"]').filter({ hasText: /Zdroje|Sources/i }).first();
        if (await sourcesTab.count() > 0 && await sourcesTab.isVisible()) {
            const isSelected = await sourcesTab.getAttribute('aria-selected') === 'true';
            if (!isSelected) {
                await sourcesTab.click();
                await this.humanDelay(1000);
            }
        }

        // Find the source item by title
        const item = this.page.locator('.single-source-container, source-list-item').filter({
            has: this.page.locator('.source-title, .title, span', { hasText: oldTitle })
        }).first();

        if (await item.count() === 0) {
            console.error(`[NotebookLM] Error: Source "${oldTitle}" not found.`);
            await this.dumpState('rename_source_not_found');
            throw new Error(`Source "${oldTitle}" not found`);
        }

        // Find and click the 'more' options button (three vertical dots)
        const moreBtn = item.locator('button').filter({
            has: this.page.locator('mat-icon', { hasText: 'more_vert' })
        }).first();

        if (await moreBtn.count() === 0) {
             throw new Error(`More options button for source "${oldTitle}" not found`);
        }

        await moreBtn.click();
        await this.humanDelay(800);

        // Click Rename/Přejmenovat from the menu
        const renameOption = this.page.locator('button[role="menuitem"]').filter({
            hasText: /Přejmenovat|Rename/i
        }).first();

        if (await renameOption.count() === 0) {
            await this.page.keyboard.press('Escape');
            throw new Error(`Rename menu option for source "${oldTitle}" not found`);
        }

        await renameOption.click();
        await this.humanDelay(1000);

        // Wait for the rename dialog and input
        const inputSelector = 'mat-dialog-container input[type="text"], .rename-dialog input';
        await this.page.waitForSelector(inputSelector, { timeout: 5000 });

        // Fill the new title and submit
        await this.page.fill(inputSelector, newTitle);
        await this.humanDelay(300);

        // The submit button inside the dialog
        const submitBtn = this.page.locator('mat-dialog-container button').filter({
            hasText: /Uložit|Save/i
        }).first();

        if (await submitBtn.count() > 0) {
            await submitBtn.click();
        } else {
            // Fallback: pressing Enter
            await this.page.keyboard.press('Enter');
        }

        // Wait for dialog to disappear
        await this.page.waitForSelector('mat-dialog-container', { state: 'hidden', timeout: 10000 });
        console.log(`[NotebookLM] Successfully renamed source to: "${newTitle}"`);
        await this.humanDelay(1000);
    }
}

