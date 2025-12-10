import { Page } from 'playwright';
import * as path from 'path';
import { config } from './config';


export class NotebookLMClient {
    public isBusy: boolean = false;

    constructor(private page: Page) { }

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
        await this.page.goto('https://notebooklm.google.com/', { waitUntil: 'domcontentloaded' });
    }

    async createNotebook(title: string) {
        console.log(`Creating notebook: ${title}`);
        try {
            await this.page.goto('https://notebooklm.google.com/', { waitUntil: 'domcontentloaded' });

            // Wait for "New Notebook" button
            const createBtnSelector = '.create-new-button';
            await this.page.waitForSelector(createBtnSelector, { state: 'visible', timeout: 15000 });

            // Click and wait for navigation
            await this.page.click(createBtnSelector);

            // Wait for title input
            const titleInputSelector = 'input.title-input';
            await this.page.waitForSelector(titleInputSelector, { state: 'visible', timeout: 15000 });

            // Set title
            await this.page.fill(titleInputSelector, title);
            await this.page.keyboard.press('Enter'); // Confirm title

            await this.page.waitForTimeout(2000);
        } catch (e) {
            console.error('Error creating notebook:', e);
            await this.dumpState('create_error');
            throw e;
        }
    }

    async dumpState(prefix: string = 'debug') {
        const timestamp = Date.now();
        const dataDir = path.join(process.cwd(), 'data');
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

    private async notifyDiscord(message: string, isError: boolean = false) {
        const webhookUrl = config.notifications?.discordWebhookUrl;
        if (!webhookUrl) return;

        console.log('[NotebookLM] Sending Discord notification...');
        try {
            await fetch(webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    content: message,
                    username: 'NotebookLM Bot',
                    avatar_url: 'https://upload.wikimedia.org/wikipedia/commons/8/8a/Google_Gemini_logo.svg' // Optional
                })
            });
        } catch (e) {
            console.error('[NotebookLM] Failed to send Discord notification:', e);
        }
    }


    async openNotebook(title: string) {
        console.log(`Opening notebook: ${title}`);
        await this.page.goto('https://notebooklm.google.com/', { waitUntil: 'domcontentloaded' });

        // Network idle is too slow (background polling). 
        // We rely on waiting for specific selectors instead.
        // await this.page.waitForLoadState('networkidle'); 

        try {
            // Wait for any project button to appear to ensure list is loaded
            await this.page.waitForSelector('project-button, mat-card', { timeout: 20000 });

            console.log(`[DEBUG] Searching for notebook: ${title}`);
            // Use specific locator for the project card
            // We look for a project-button that contains the title element with exact text
            const cardLocator = this.page.locator(`project-button`).filter({ has: this.page.locator(`.project-button-title`, { hasText: title }) }).first();

            // Fallback: loose text match if exact structure fails
            if (await cardLocator.count() === 0) {
                console.log('[DEBUG] Exact locator failed, trying loose text match...');
                const looseLocator = this.page.locator(`project-button, mat-card`).filter({ hasText: title }).first();
                if (await looseLocator.count() > 0) {
                    console.log('[DEBUG] Found via loose match. Clicking...');
                    await looseLocator.click();
                } else {
                    throw new Error(`Notebook with title "${title}" not found.`);
                }
            } else {
                console.log('[DEBUG] Found notebook card. Clicking primary action button...');
                const actionBtn = cardLocator.locator('.primary-action-button');
                if (await actionBtn.count() > 0 && await actionBtn.isVisible()) {
                    await actionBtn.click();
                } else {
                    await cardLocator.click();
                }
            }

            // Wait for navigation to notebook URL
            await this.page.waitForURL('**/notebook/**', { timeout: 15000 });
            console.log('[DEBUG] Notebook opened successfully (URL match).');

        } catch (e) {
            console.error('Failed to open notebook', e);
            const dataDir = path.join(process.cwd(), 'data');
            if (!require('fs').existsSync(dataDir)) require('fs').mkdirSync(dataDir, { recursive: true });
            await this.page.screenshot({ path: path.join(dataDir, `open-notebook-fail-${Date.now()}.png`) });
            throw e;
        }
    }

    async addSourceUrl(url: string) {
        console.log(`Adding source URL: ${url}`);

        // RESPONSIVE UI HANDLING: Ensure we are on "Zdroje" (Sources) tab
        const sourcesTab = this.page.locator('div[role="tab"]').filter({ hasText: /Zdroje|Sources/i }).first();
        if (await sourcesTab.count() > 0 && await sourcesTab.isVisible()) {
            const isSelected = await sourcesTab.getAttribute('aria-selected') === 'true';
            if (!isSelected) {
                console.log('[DEBUG] Switching to Sources tab...');
                await sourcesTab.click();
                await this.humanDelay(1000);
            }
        }

        // Find the "Web" or "Website" button. 
        // It captures "Weby", "Website", "Link", etc.
        const sourceBtn = await this.page.evaluateHandle(() => {
            const buttons = Array.from(document.querySelectorAll('button.drop-zone-icon-button'));
            return buttons.find(b => {
                const text = b.textContent?.toLowerCase() || '';
                return text.includes('web') || text.includes('link') || text.includes('site');
            });
        });

        if (!sourceBtn) {
            throw new Error('Website source button not found');
        }

        await sourceBtn.asElement()?.click();

        // The dialog uses a textarea for URLs
        const urlInputSelector = 'mat-dialog-container textarea';
        try {
            await this.page.waitForSelector(urlInputSelector, { timeout: 5000 });
            await this.page.fill(urlInputSelector, url);

            // Wait for the "Insert" button to become enabled (remove disabled class/attr)
            const submitSelector = 'mat-dialog-container button.mat-primary';
            await this.page.waitForFunction((sel: string) => {
                const btn = document.querySelector(sel);
                return btn && !btn.classList.contains('mat-mdc-button-disabled') && !btn.hasAttribute('disabled');
            }, submitSelector, { timeout: 5000 });

            await this.page.click(submitSelector);

            // Wait for dialog to close
            await this.page.waitForSelector('mat-dialog-container', { state: 'hidden', timeout: 5000 });

        } catch (e) {
            console.error('Failed to fill URL source dialog', e);
            throw e;
        }
    }

    /**
     * Add sources from Google Drive by document name or ID.
     * @param docNames Array of document names (or partial names) to search for and select
     * @param notebookTitle Optional notebook to open first
     */
    async addSourceFromDrive(docNames: string[], notebookTitle?: string) {
        if (notebookTitle) {
            await this.openNotebook(notebookTitle);
        }

        console.log(`[DEBUG] Adding Google Drive sources: ${docNames.join(', ')}`);

        // RESPONSIVE UI HANDLING: Ensure we are on "Zdroje" (Sources) tab
        // In narrow view, "Add sources" is only visible in Sources tab.
        const sourcesTab = this.page.locator('div[role="tab"]').filter({ hasText: /Zdroje|Sources/i }).first();
        if (await sourcesTab.count() > 0 && await sourcesTab.isVisible()) {
            const isSelected = await sourcesTab.getAttribute('aria-selected') === 'true';
            if (!isSelected) {
                console.log('[DEBUG] Switching to Sources tab...');
                await sourcesTab.click();
                await this.humanDelay(1000);
            }
        }

        // Click "Add sources" button
        const addSourceBtn = this.page.locator('button').filter({ hasText: /Přidat zdroje|Add sources/i }).first();
        if (await addSourceBtn.count() === 0) {
            throw new Error('"Add sources" button not found');
        }
        await addSourceBtn.click();
        await this.humanDelay(1000);

        // Click "Disk" (Google Drive) button in the dialog
        const driveBtn = this.page.locator('button.drop-zone-icon-button').filter({ hasText: /Disk|Drive/i }).first();
        if (await driveBtn.count() === 0) {
            // Try alternative selector
            const altDriveBtn = this.page.getByText('Disk').first();
            if (await altDriveBtn.count() > 0) {
                await altDriveBtn.click();
            } else {
                throw new Error('Google Drive button not found');
            }
        } else {
            await driveBtn.click();
        }

        // Wait for Drive picker iframe to load
        await this.page.waitForTimeout(2000);

        // The Google Drive picker is in an iframe
        const pickerFrame = this.page.frameLocator('iframe').first();

        for (const docName of docNames) {
            console.log(`[DEBUG] Searching for document: ${docName}`);

            // Use the search box to find the document
            const searchInput = pickerFrame.locator('input[type="text"]').first();
            if (await searchInput.count() > 0) {
                await searchInput.fill(docName);
                await this.page.waitForTimeout(1500); // Wait for search results

                // Click on the first matching result
                const fileRow = pickerFrame.locator(`div[role="option"], div[role="row"]`).filter({ hasText: docName }).first();
                if (await fileRow.count() > 0) {
                    await fileRow.click();
                    console.log(`[DEBUG] Selected: ${docName}`);
                } else {
                    console.warn(`[DEBUG] Document not found: ${docName}`);
                }
            }
        }

        // Click "Vybrat" (Select) button to confirm selection
        const selectBtn = pickerFrame.locator('button').filter({ hasText: /Vybrat|Select/i });
        if (await selectBtn.count() > 0 && await selectBtn.isEnabled()) {
            await selectBtn.click();
            console.log('[DEBUG] Confirmed Drive source selection.');
            await this.page.waitForTimeout(2000);
        } else {
            console.warn('[DEBUG] Select button not found or disabled. No files selected?');
        }
    }

    async generateAudioOverview(notebookTitle?: string, sources?: string[], customPrompt?: string, waitForCompletion: boolean = true, dryRun: boolean = true) {
        if (this.isBusy) {
            throw new Error('NotebookLM client is already busy.');
        }
        this.isBusy = true;
        try {
            if (notebookTitle) {
                await this.openNotebook(notebookTitle);
            }

            // Handle Source Selection if provided
            if (sources && sources.length > 0) {
                console.log(`[DEBUG] Selecting sources: ${sources.join(', ')}`);

                // 1. Find "Select all" checkbox and uncheck it to clear selection
                // English: "Select all sources", Czech: "Vybrat všechny zdroje"
                const selectAllSelector = 'div[role="checkbox"]:has-text("Select all sources"), div[role="checkbox"]:has-text("Vybrat všechny zdroje"), div:has-text("Vybrat všechny zdroje"):has(input[type="checkbox"])';

                // Try to find the "Select all" element
                const selectAllBtn = await this.page.$(selectAllSelector);
                if (selectAllBtn) {
                    const isChecked = await selectAllBtn.getAttribute('aria-checked') === 'true' || await selectAllBtn.isChecked().catch(() => false);
                    if (isChecked) {
                        console.log('[DEBUG] Unchecking "Select all sources"...');
                        await selectAllBtn.click();
                        await this.page.waitForTimeout(500);
                    }
                } else {
                    console.warn('[DEBUG] "Select all" checkbox not found. Proceeding cautiously.');
                }

                // 2. Check specific sources
                for (const sourceName of sources) {
                    console.log(`[DEBUG] looking for source: ${sourceName}`);
                    // Simple text match for now
                    const sourceRow = await this.page.$(`div:has-text("${sourceName}")`);
                    if (sourceRow) {
                        const checkbox = await sourceRow.$('div[role="checkbox"], input[type="checkbox"]');
                        if (checkbox) {
                            const isChecked = await checkbox.getAttribute('aria-checked') === 'true' || await checkbox.isChecked().catch(() => false);
                            if (!isChecked) {
                                await checkbox.click();
                                console.log(`[DEBUG] Checked source: ${sourceName}`);
                            } else {
                                console.log(`[DEBUG] Source already checked: ${sourceName}`);
                            }
                        } else {
                            console.warn(`[DEBUG] Checkbox not found for source: ${sourceName}`);
                        }
                    } else {
                        console.warn(`[DEBUG] Source not found: ${sourceName}`);
                    }
                }
            }

            // Check if audio generation is already in progress (in artifact library)
            const generatingLocator = this.page.locator('.artifact-title').filter({ hasText: /Generování|Generating/ });
            if (await generatingLocator.count() > 0) {
                console.log('[DEBUG] Audio generation already in progress.');
                return;
            }

            // RESPONSIVE UI HANDLING: Check for Studio tab
            console.log('[DEBUG] Checking for Studio tab (responsive layout)...');
            // Studio tab is usually a div/button in the tab list
            const studioTab = this.page.locator('div[role="tab"]').filter({ hasText: /^Studio$/ }).first();
            if (await studioTab.count() > 0 && await studioTab.isVisible()) {
                const isSelected = await studioTab.getAttribute('aria-selected') === 'true';
                if (!isSelected) {
                    console.log('[DEBUG] Switching to Studio tab...');
                    await studioTab.click();
                    await this.humanDelay(1000);
                } else {
                    console.log('[DEBUG] Studio tab already active.');
                }
            }

            // Wait for notebook guide loading to finish (if any)
            const loadingSelector = '.notebook-guide-loading-animation';
            try {
                // Only wait if it's visible to avoid waiting on hidden elements
                const loading = this.page.locator(loadingSelector);
                if (await loading.isVisible()) {
                    console.log('[DEBUG] Waiting for Notebook Guide to load...');
                    await loading.waitFor({ state: 'hidden', timeout: 30000 });
                }
            } catch (e) {
                console.warn('[DEBUG] Timeout waiting for loading animation to hide (or it was never there).');
            }

            // CHECK FOR EXISTING AUDIO
            // If audio exists, we might want to Regenerate if customPrompt is provided.
            const audioPlayer = this.page.locator('audio-player');
            const audioArtifact = this.page.locator('artifact-library-item').filter({
                hasText: /Audio (Overview|přehled)|Podcast|audio_magic_eraser/i
            });

            // Check if audio exists (player or artifact)
            const hasAudio = (await audioPlayer.count() > 0) || (await audioArtifact.count() > 0);

            if (hasAudio) {
                console.log('[DEBUG] Detected existing Audio Overview.');
                if (!customPrompt) {
                    console.log('[DEBUG] Audio exists and no custom prompt requested. Skipping generation.');
                    return;
                } else {
                    console.log('[DEBUG] Audio exists but Custom Prompt provided. Proceeding to Customization/Regeneration...');

                    // 1. Find the Edit Button
                    // It's inside a basic-create-artifact-button with label "Audio Overview" or similar
                    // Button has aria-label "Customize Audio Overview" (English) or "Přizpůsobit audio přehled" (Czech)
                    const editBtnSelector = [
                        'button[aria-label="Customize Audio Overview"]',
                        'button[aria-label="Přizpůsobit audio přehled"]',
                        'basic-create-artifact-button[aria-label*="Audio"] button.edit-button',
                        'basic-create-artifact-button[aria-label*="Audio"] button:has-text("Customize")',
                        'basic-create-artifact-button[aria-label*="Audio"] button:has-text("Přizpůsobit")'
                    ].join(',');

                    const editBtn = this.page.locator(editBtnSelector).first();

                    if (await editBtn.count() > 0 && await editBtn.isVisible()) {
                        console.log('[DEBUG] Clicking edit button for Audio card...');
                        await editBtn.click();

                        // Wait for dialog
                        console.log('[DEBUG] Waiting for dialog...');
                        // Dialog usually has role="dialog" or class="mat-mdc-dialog-container"
                        const dialog = this.page.locator('div[role="dialog"], .mat-mdc-dialog-container');
                        try {
                            await dialog.first().waitFor({ state: 'visible', timeout: 5000 });
                            console.log('[DEBUG] Dialog appeared.');
                        } catch (e) {
                            console.warn('[DEBUG] Timeout waiting for dialog to appear.');
                            await this.dumpState('audio_dialog_timeout');
                            return;
                        }

                        // Fill the Prompt
                        const promptInputSelector = 'textarea, input[type="text"]'; // Usually only one textarea in this dialog
                        const promptInput = dialog.locator(promptInputSelector).first();
                        if (await promptInput.count() > 0) {
                            console.log('[DEBUG] Filling custom prompt...');
                            await promptInput.fill(customPrompt);
                        } else {
                            console.warn('[DEBUG] Could not find prompt input in dialog.');
                        }

                        // Click Generate
                        // English: "Generate", Czech: "Vygenerovat"
                        console.log('[DEBUG] Waiting for Generate button...');
                        const generateBtn = dialog.locator('button').filter({ hasText: /Generate|Vygenerovat/i }).first();

                        try {
                            await generateBtn.waitFor({ state: 'visible', timeout: 8000 });
                            console.log('[DEBUG] Clicking Generate...');
                            await generateBtn.click();
                            // Wait for dialog to close?
                        } catch (e) {
                            console.error('[DEBUG] Timeout waiting for "Generate" button in dialog.');
                            await this.dumpState('audio_dialog_timeout');
                            return;
                        }

                    } else {
                        console.log('[DEBUG] Could not find "Customize/Edit" button for Audio. Customization skipped.');
                        return;
                    }
                }
            } else {
                // No Audio exists. Try to find "Generate" or "Audio Overview" card to start generation.
                console.log('[DEBUG] No existing audio found. Attempting to start generation...');

                // Define Customization Selector
                const customizeBtnSelector = [
                    'button[aria-label="Customize Audio Overview"]',
                    'button[aria-label="Přizpůsobit audio přehled"]',
                    'button[aria-label="Customize"]',
                    'button[aria-label="Přizpůsobit"]',
                    'button:has-text("Customize")',
                    'button:has-text("Upravit")' // Czech 'Customize'
                ].join(',');

                // Helper to handle dialog interaction
                const handleDialog = async () => {
                    console.log('[DEBUG] Waiting for dialog...');
                    // Dialog usually has role="dialog" or class="mat-mdc-dialog-container"
                    // Filter for VISIBLE dialog to avoid hidden containers from previous interactions
                    const dialog = this.page.locator('div[role="dialog"], .mat-mdc-dialog-container').filter({ has: this.page.locator(':visible') }).last();

                    try {
                        await dialog.waitFor({ state: 'visible', timeout: 8000 });
                        console.log('[DEBUG] Dialog appeared.');
                    } catch (e) {
                        console.warn('[DEBUG] Timeout waiting for visible dialog.');
                        await this.dumpState('audio_dialog_timeout');
                        return false;
                    }

                    // Fill the Prompt
                    const promptInputSelector = 'textarea, input[type="text"]';
                    const promptInput = dialog.locator(promptInputSelector).first();
                    if (await promptInput.count() > 0) {
                        console.log('[DEBUG] Filling custom prompt...');
                        await promptInput.fill(customPrompt || '');
                    } else {
                        console.warn('[DEBUG] Could not find prompt input in dialog.');
                    }

                    // Click Generate
                    console.log('[DEBUG] Waiting for Generate button...');
                    const generateBtn = dialog.locator('button').filter({ hasText: /Generate|Vygenerovat/i }).first();

                    try {
                        await generateBtn.waitFor({ state: 'visible', timeout: 10000 });
                        console.log('[DEBUG] Clicking Generate...');

                        if (dryRun) {
                            console.log('[DRY RUN] Would click "Generate" in dialog now. Skipping generation.');
                            await this.notifyDiscord(`🧪 Dry Run: Audio generation for "${notebookTitle || 'Current'}" simulated successfully. No quota used.`);
                            this.isBusy = false; // Reset busy state
                            return true;
                        }

                        await generateBtn.click();

                        // WAIT FOR GENERATION CONFIRMATION
                        console.log('[DEBUG] Waiting for generation to start (checking UI indicator)...');
                        // Look for "Generating..." or "Generování..." in the artifact title/status
                        try {
                            const generatingIndicator = this.page.locator('.artifact-title, .status-text').filter({ hasText: /Generování|Generating/ });
                            await generatingIndicator.first().waitFor({ state: 'visible', timeout: 15000 });
                            console.log('[DEBUG] Generation started successfully (Indicator visible).');
                        } catch (e) {
                            console.warn('[DEBUG] "Generating" indicator did not appear within timeout. Proceeding but verification is weak.');
                        }

                        if (waitForCompletion) {
                            console.log('[DEBUG] Waiting for audio generation to complete...');
                            const maxWait = 10 * 60 * 1000; // 10 minutes max
                            const startTime = Date.now();

                            while (Date.now() - startTime < maxWait) {
                                await this.page.waitForTimeout(5000);
                                const generating = await this.page.locator('.artifact-title, .status-text').filter({ hasText: /Generování|Generating/ }).count();
                                if (generating === 0) {
                                    console.log('[DEBUG] Generation complete!');
                                    await this.notifyDiscord(`✅ Audio Overview generation complete for notebook: "${notebookTitle || 'Current'}"`);
                                    return true;
                                }
                            }

                            console.warn('[DEBUG] Timeout waiting for audio generation.');
                            await this.notifyDiscord(`⚠️ Timeout waiting for Audio Overview for notebook: "${notebookTitle || 'Current'}"`, true);
                        }

                        if (!waitForCompletion) {
                            // Non-blocking mode (original behavior)
                            await this.notifyDiscord(`⏳ Audio Overview generation started for notebook: "${notebookTitle || 'Current'}"`);
                        }

                        return true;
                    } catch (e) {
                        console.error('[DEBUG] Failed during generation click or wait.', e);
                        await this.dumpState('audio_dialog_timeout');
                        return false;
                    }
                };

                // 1. Try finding Customize button directly (maybe already expanded)
                if (customPrompt) {
                    let customizeBtn = this.page.locator(customizeBtnSelector).first();
                    if (await customizeBtn.count() > 0 && await customizeBtn.isVisible()) {
                        console.log('[DEBUG] Found Customize button directly. Clicking...');
                        await customizeBtn.click();
                        await handleDialog();
                        return;
                    }
                }

                // 2. Check artifact library for existing Audio (Completed or Generating)
                const artifactItems = this.page.locator('artifact-library-item');
                const totalItems = await artifactItems.count();
                console.log(`[DEBUG] Locator 'artifact-library-item' count: ${totalItems}`);

                // DUMP STATE FOR ANALYSIS
                await this.dumpState('artifact_library_debug');

                let audioCount = 0;
                let isGenerating = false;

                for (let i = 0; i < totalItems; i++) {
                    const item = artifactItems.nth(i);
                    const text = await item.innerText();
                    const ariaLabel = await item.getAttribute('aria-label') || '';
                    console.log(`[DEBUG] Item ${i}: text="${text}", label="${ariaLabel}"`);

                    if (/Audio (Overview|přehled)|audio_magic_eraser/i.test(text) || /Audio (Overview|přehled)|audio_magic_eraser/i.test(ariaLabel)) {
                        audioCount++;
                        if (/(Generating|Generovat|Generování)/i.test(text)) {
                            isGenerating = true;
                        }
                    }
                }

                if (audioCount > 0) {
                    console.log(`[INFO] Found ${audioCount} existing Audio Overview(s) in this notebook.`);
                    if (isGenerating) {
                        console.log('[DEBUG] At least one audio is currently GENERATING. Skipping new request.');
                        return;
                    }
                    console.log('[DEBUG] Audio ALREADY EXISTS. Skipping new request.');
                    return;
                }

                // 3. Find the "Create" button
                const audioCardText = /Audio (Overview|přehled)|audio_magic_eraser/i;
                const createBtn = this.page.locator('basic-create-artifact-button').filter({ hasText: audioCardText }).first();

                if (await createBtn.count() > 0 && await createBtn.isVisible()) {
                    console.log('[DEBUG] Found "Create Audio Overview" button.');

                    if (customPrompt) {
                        // Checking for "Edit" button inside the create button component:
                        const editBtn = createBtn.locator('button.edit-button');
                        if (await editBtn.count() > 0 && await editBtn.isVisible()) {
                            console.log('[DEBUG] Customize button found. Handling Customization...');
                            if (dryRun) {
                                console.log('[DRY RUN] Would click "Customize" and then "Generate". Skipping.');
                                await this.notifyDiscord(`🧪 Dry Run: Audio generation for "${notebookTitle || 'Current'}" simulated (Customized).`);
                                return;
                            }
                            await editBtn.click();
                            await handleDialog();
                            return;
                        }
                    }

                    if (dryRun) {
                        console.log('[DRY RUN] The "Create Audio Overview" button starts generation immediately. SKIPPING click.');
                        await this.notifyDiscord(`🧪 Dry Run: Audio generation for "${notebookTitle || 'Current'}" simulated. No quota used.`);
                        this.isBusy = false;
                        return;
                    }

                    console.log('[WET RUN] Clicking "Create Audio Overview" to START generation...');
                    await createBtn.click();

                    if (waitForCompletion) {
                        await this.waitForGeneration(notebookTitle);
                    }
                    return;
                }

                console.warn('[DEBUG] Could not find "Create Audio Overview" button or existing audio.');
                await this.dumpState('audio_not_found');
            }
        } finally {
            this.isBusy = false;
        }
    }

    private async waitForGeneration(notebookTitle?: string) {
        console.log('[DEBUG] Waiting for audio generation to complete...');
        // Wait for indicator
        await this.page.waitForTimeout(3000);

        const maxWait = 15 * 60 * 1000; // 15 min
        const startTime = Date.now();

        while (Date.now() - startTime < maxWait) {
            await this.page.waitForTimeout(5000);
            // Check if it is still generating
            const generating = await this.page.locator('artifact-library-item').filter({ hasText: /(Generating|Generovat|Generování)/i }).count();

            // Check if complete (just look for the item generally, if it exists and NOT generating)
            const completed = await this.page.locator('artifact-library-item').filter({ hasText: /Audio (Overview|přehled)|audio_magic_eraser/i }).count();

            if (generating === 0 && completed > 0) {
                console.log('[DEBUG] Generation complete!');
                await this.notifyDiscord(`✅ Audio Overview generation complete for notebook: "${notebookTitle || 'Current'}"`);
                return;
            }
        }
        console.warn('[DEBUG] Timeout waiting for audio generation.');
        await this.notifyDiscord(`⚠️ Timeout waiting for Audio Overview for notebook: "${notebookTitle || 'Current'}"`, true);
    }

    async downloadAudio(notebookTitle: string, outputFilename: string) {
        if (notebookTitle) {
            await this.openNotebook(notebookTitle);
        }

        console.log(`[DEBUG] Attempting to download audio to: ${outputFilename}`);

        // RESPONSIVE UI HANDLING: Check for Studio tab
        const studioTab = this.page.locator('div[role="tab"]').filter({ hasText: /^Studio$/ }).first();
        if (await studioTab.count() > 0 && await studioTab.isVisible()) {
            const isSelected = await studioTab.getAttribute('aria-selected') === 'true';
            if (!isSelected) {
                console.log('[DEBUG] Switching to Studio tab...');
                await studioTab.click();
                await this.page.waitForTimeout(1000);
            }
        }

        await this.page.waitForTimeout(2000);

        // 1. Try ACTIVE AUDIO PLAYER (Footer) first
        console.log('[DEBUG] Checking for active Audio Player footer...');
        const audioPlayer = this.page.locator('audio-player').first();

        let targetMenuBtn = null;
        let extractionSource = 'none';

        // Relaxed check: Just existence is enough to try, we can handle visibility handling in click
        if (await audioPlayer.count() > 0) {
            console.log('[DEBUG] Found active Audio Player DOM element.');
            targetMenuBtn = audioPlayer.locator('button[aria-label*="More"], button[aria-label*="Další"], button:has(mat-icon:has-text("more_vert"))').first();
            if (await targetMenuBtn.count() > 0) {
                extractionSource = 'player';
                console.log('[DEBUG] Using Audio Player menu button.');
            }
        }

        // 2. If no player button, find the Audio Artifact in the Library
        if (!targetMenuBtn || await targetMenuBtn.count() === 0) {
            console.log('[DEBUG] Audio Player menu not found. Searching in Artifact Library...');

            const audioArtifact = this.page.locator('artifact-library-item').filter({
                hasText: /Audio (Overview|přehled)|Podcast|audio_magic_eraser/i
            }).first();

            if (await audioArtifact.count() > 0) {
                console.log('[DEBUG] Found Audio Artifact in library. Hovering to reveal controls...');
                await audioArtifact.scrollIntoViewIfNeeded();
                await audioArtifact.hover();
                await this.humanDelay(500);

                // Look for "..." menu button within this artifact item
                // Priority: exact icon match, text match in tooltip/label
                targetMenuBtn = audioArtifact.locator('button').filter({
                    has: this.page.locator('mat-icon').filter({ hasText: 'more_vert' })
                }).first();

                if (await targetMenuBtn.count() === 0) {
                    targetMenuBtn = audioArtifact.locator('button[mattooltip*="Další"], button[mattooltip*="More"], button[aria-label*="Další"], button[aria-label*="More"]').first();
                }
                extractionSource = 'library';
            }
        }

        // 3. Execute Menu Interaction with RETRY LOGIC
        if (extractionSource !== 'none') { // Changed condition to check if extractionSource is set
            console.log(`[DEBUG] Interaction Target: ${extractionSource}. Starting Click Strategy...`);

            // Helper to get fresh button handle
            const getButton = () => {
                if (extractionSource === 'audio-player') {
                    return this.page.locator('audio-player button.menu-button, audio-player button[aria-label*="Další"], audio-player button[aria-label*="More"]').first();
                } else {
                    // Library fallback
                    const art = this.page.locator('artifact-library-item').filter({
                        has: this.page.locator('mat-icon').filter({ hasText: 'audio_magic_eraser' })
                    }).first(); // Simplified for speed

                    // Try finding the specific class from the dump
                    return art.locator('button.artifact-more-button').first();
                }
            };

            const isMenuOpen = async () => await this.page.locator('.cdk-overlay-pane, .mat-mdc-menu-panel').count() > 0;

            const findAndClickDownload = async () => {
                // 1. Wait for menu animation
                await this.page.waitForTimeout(500);

                // Specific Text Search (Czech)
                const czDownload = this.page.locator('button[role="menuitem"]').filter({ hasText: 'Stáhnout' }).first();
                if (await czDownload.isVisible()) {
                    console.log('[DEBUG] Found "Stáhnout" menu item. Clicking...');
                    await czDownload.click();
                    return true;
                }

                // Specific Icon Search (save_alt)
                const saveAltIcon = this.page.locator('mat-icon').filter({ hasText: 'save_alt' }).locator('xpath=ancestor::button[contains(@role, "menuitem")]').first();
                if (await saveAltIcon.isVisible()) {
                    console.log('[DEBUG] Found "save_alt" icon menu item. Clicking...');
                    await saveAltIcon.click();
                    return true;
                }

                // Fallback Text Search (English)
                const enDownload = this.page.locator('button[role="menuitem"]').filter({ hasText: 'Download' }).first();
                if (await enDownload.isVisible()) {
                    console.log('[DEBUG] Found "Download" menu item. Clicking...');
                    await enDownload.click();
                    return true;
                }

                // DEBUGGING: Log what IS visible in the menu
                const overlays = this.page.locator('.cdk-overlay-pane, .mat-mdc-menu-panel').filter({ has: this.page.locator(':visible') });
                if (await overlays.count() > 0) {
                    const texts = await overlays.allInnerTexts();
                    console.log('[DEBUG] Menu is OPEN but Download option not matched. Visible menu text:', texts);
                }

                return false;
            };

            let success = false;

            // Attempt 1: Standard Click
            console.log('[DEBUG] Attempt 1: getButton & Standard Click...');
            try {
                const btn = getButton();
                if (await btn.count() > 0) {
                    await btn.scrollIntoViewIfNeeded();
                    await btn.click({ timeout: 5000 });
                    await this.humanDelay(800); // Wait for animation
                    if (await isMenuOpen()) {
                        console.log('[DEBUG] Menu detected open.');
                        if (await findAndClickDownload()) success = true;
                    }
                } else { console.log('[DEBUG] Button not found for Attempt 1'); }
            } catch (e: any) { console.warn('[DEBUG] Click 1 failed:', e.message || String(e)); }

            // Attempt 2: Force Click
            if (!success && !await isMenuOpen()) {
                console.log('[DEBUG] Attempt 2: Force Click...');
                try {
                    const btn = getButton();
                    if (await btn.count() > 0) {
                        await btn.click({ force: true, timeout: 5000 });
                        await this.page.waitForTimeout(1000);
                        if (await isMenuOpen()) {
                            if (await findAndClickDownload()) success = true;
                        }
                    }
                } catch (e: any) { console.warn('[DEBUG] Click 2 failed:', e.message || String(e)); }
            }

            // Attempt 3: Dispatch Event
            if (!success && !await isMenuOpen()) {
                console.log('[DEBUG] Attempt 3: dispatchEvent("click")...');
                try {
                    const btn = getButton();
                    if (await btn.count() > 0) {
                        await btn.dispatchEvent('click');
                        await this.page.waitForTimeout(1000);
                        if (await isMenuOpen()) {
                            if (await findAndClickDownload()) success = true;
                        }
                    }
                } catch (e: any) { console.warn('[DEBUG] Click 3 failed:', e.message || String(e)); }
            }

            // Attempt 4: Keyboard Enter
            if (!success && !await isMenuOpen()) {
                console.log('[DEBUG] Attempt 4: Keyboard Enter...');
                try {
                    const btn = getButton();
                    if (await btn.count() > 0) {
                        await btn.focus({ timeout: 2000 });
                        await this.page.keyboard.press('Enter');
                        await this.page.waitForTimeout(1000);
                        if (await isMenuOpen()) {
                            if (await findAndClickDownload()) success = true;
                        }
                    }
                } catch (e: any) {
                    console.warn('[DEBUG] Focus attempt failed:', e.message || String(e));
                }
            }

            // Final check if menu opened but download failed
            if (!success && await isMenuOpen()) {
                console.log('[DEBUG] Menu is open, trying once more to find download item...');
                if (await findAndClickDownload()) success = true;
            }

            if (success) {
                try {
                    console.log('[DEBUG] Waiting for download event...');
                    const downloadPromise = this.page.waitForEvent('download', { timeout: 15000 });
                    // Click already happened in findAndClickDownload
                    const download = await downloadPromise;

                    // Ensure directory exists
                    const fs = require('fs');
                    const dir = path.dirname(outputFilename);
                    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

                    await download.saveAs(outputFilename);
                    console.log(`[DEBUG] Audio saved via download event to ${outputFilename}`);
                    return true;
                } catch (e: any) {
                    console.warn('[DEBUG] Download event capture failed (or click failed to trigger it). Error:', e);
                }
            } else {
                console.log('[DEBUG] Failed to find Download option after all attempts.');
                await this.dumpState('download_menu_fail');
            }
        } else {
            console.log('[DEBUG] "More options" button target not defined.');
        }
        const audioEl = this.page.locator('audio').first();
        if (await audioEl.count() > 0) {
            const src = await audioEl.getAttribute('src');
            if (src) {
                console.log(`[DEBUG] Found generic audio source element.`);
                const fs = require('fs');
                const buffer = await this.page.evaluate(async (audioSrc) => {
                    const response = await fetch(audioSrc);
                    const blob = await response.blob();
                    const arrayBuffer = await blob.arrayBuffer();
                    return Array.from(new Uint8Array(arrayBuffer));
                }, src);

                const dir = path.dirname(outputFilename);
                if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
                fs.writeFileSync(outputFilename, Buffer.from(buffer));
                console.log(`[DEBUG] Audio saved from <audio> src to ${outputFilename}`);
                return true;
            }
        }

        console.error('[DEBUG] Failed to download audio. Could not find artifact or valid download path.');
        await this.dumpState('download_audio_fail');
        return false;
    }

    async downloadAllAudio(notebookTitle: string, outputDir: string) {
        if (notebookTitle) {
            await this.openNotebook(notebookTitle);
        }

        console.log(`[DEBUG] Downloading ALL audio files to directory: ${outputDir}`);

        // Create output directory if it doesn't exist
        const fs = require('fs');
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
            console.log(`[DEBUG] Created output directory: ${outputDir}`);
        }

        // RESPONSIVE UI HANDLING: Check for Studio tab
        const studioTab = this.page.locator('div[role="tab"]').filter({ hasText: /^Studio$/ }).first();
        if (await studioTab.count() > 0 && await studioTab.isVisible()) {
            const isSelected = await studioTab.getAttribute('aria-selected') === 'true';
            if (!isSelected) {
                console.log('[DEBUG] Switching to Studio tab...');
                await studioTab.click();
                await this.page.waitForTimeout(1000);
            }
        }

        await this.page.waitForTimeout(2000);

        // Find ALL audio artifacts in the library
        console.log('[DEBUG] Searching for all audio artifacts...');
        const audioArtifacts = this.page.locator('artifact-library-item').filter({
            has: this.page.locator('mat-icon').filter({ hasText: /^audio_magic_eraser$/ })
        });

        const count = await audioArtifacts.count();
        console.log(`[DEBUG] Found ${count} audio artifact(s)`);

        if (count === 0) {
            console.warn('[DEBUG] No audio artifacts found in notebook.');
            return [];
        }

        const downloaded = [];

        // Iterate through each audio artifact
        for (let i = 0; i < count; i++) {
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
}

