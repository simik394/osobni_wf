import { Page } from 'playwright';

export class NotebookLMClient {
    constructor(private page: Page) { }

    async init() {
        await this.page.goto('https://notebooklm.google.com/', { waitUntil: 'domcontentloaded' });
    }

    async createNotebook(title: string) {
        console.log(`Creating notebook: ${title}`);
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
    }

    async dumpState(prefix: string = 'debug') {
        const timestamp = Date.now();
        const htmlPath = `/app/data/${prefix}_${timestamp}.html`;
        const pngPath = `/app/data/${prefix}_${timestamp}.png`;

        try {
            console.log(`[NotebookLM] Dumping state to ${htmlPath} / ${pngPath}`);
            const html = await this.page.evaluate(() => document.body.outerHTML);
            const fs = require('fs');
            fs.writeFileSync(htmlPath, html);
            await this.page.screenshot({ path: pngPath, fullPage: true });
            return { htmlPath, pngPath };
        } catch (e) {
            console.error('[NotebookLM] Failed to dump state:', e);
            throw e;
        }
    }

    async openNotebook(title: string) {
        console.log(`Opening notebook: ${title}`);
        await this.page.goto('https://notebooklm.google.com/', { waitUntil: 'domcontentloaded' });

        try {
            // Wait for any project button to appear to ensure list is loaded
            await this.page.waitForSelector('project-button, mat-card', { timeout: 10000 });

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
            await this.page.screenshot({ path: '/app/data/open-notebook-fail.png' });
            throw e;
        }
    }

    async addSourceUrl(url: string) {
        console.log(`Adding source URL: ${url}`);

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

    async generateAudioOverview(notebookTitle?: string, sources?: string[]) { // sources: optional list of source filenames to include
        if (notebookTitle) {
            await this.openNotebook(notebookTitle);
        }

        // Handle Source Selection if provided
        if (sources && sources.length > 0) {
            console.log(`[DEBUG] Selecting sources: ${sources.join(', ')}`);

            // 1. Find "Select all" checkbox and uncheck it to clear selection
            // English: "Select all sources", Czech: "Vybrat všechny zdroje"
            const selectAllSelector = 'div[role="checkbox"]:has-text("Select all sources"), div[role="checkbox"]:has-text("Vybrat všechny zdroje"), div:has-text("Vybrat všechny zdroje"):has(input[type="checkbox"])';

            // We need to handle different DOM structures for checkboxes. 
            // Often they are div[role=checkbox] or input[type=checkbox].

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
                    // Try to find the checkbox within or near this row
                    // Assuming the row *contains* the checkbox or is clickable
                    // Let's try clicking the checkbox specifically if possible
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
                        // Click the row itself? Might open source viewer.
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

        // Check if audio is already completed (Play button available or "Listen" text)
        // This is harder to genericize, but let's assume if we see "Audio přehled" in the library that IS NOT generating, it might be done.
        // For now, just handling the "Generating" case prevents the timeout loop.

        // Step 1: Check for "Vygenerovat" or "Generate" button directly (if dialog is already open)
        console.log('[DEBUG] Looking for Generate button...');
        const generateBtnSelector = 'button:has-text("Vygenerovat"), button:has-text("Generate")';
        let generateBtn = await this.page.$(generateBtnSelector);

        if (generateBtn) {
            console.log('[DEBUG] Found Generate button directly. Clicking...');
            await generateBtn.click();
            return;
        }

        console.log('[DEBUG] Generate button not found. Looking for "Audio přehled" card...');
        // Locate the "Audio Overview" or "Audio přehled" button in the Studio panel
        const audioOverviewText = this.page.locator('basic-create-artifact-button .create-label-container').filter({ hasText: /Audio (Overview|přehled)/ }).first();

        if (await audioOverviewText.count() > 0) {
            console.log('[DEBUG] Found "Audio přehled" text. Clicking...');
            await audioOverviewText.click();

            // Wait for the modal/dialog to appear
            console.log('[DEBUG] Waiting for dialog...');
            try {
                // Wait specifically for the "Vygenerovat" button to appear in the dialog
                await this.page.waitForSelector(generateBtnSelector, { timeout: 5000 });
                console.log('[DEBUG] Dialog appeared. Found "Vygenerovat" button.');

                generateBtn = await this.page.$(generateBtnSelector);
                if (generateBtn) {
                    await generateBtn.click();
                    console.log('[DEBUG] Clicked "Vygenerovat".');
                    return;
                }
            } catch (e) {
                console.error('[DEBUG] Timeout waiting for "Vygenerovat" button in dialog.', e);

                // Double check if it started generating effectively during the wait?
                if (await this.page.locator('.artifact-title').filter({ hasText: /Generování|Generating/ }).count() > 0) {
                    console.log('[DEBUG] Audio generation started (detected in library).');
                    return;
                }

                await this.dumpState('audio_dialog_timeout');
            }
        } else {
            console.warn('[DEBUG] Could not find "Audio přehled" card.');
        }

        // Final fallback/debug snapshot
        if (!generateBtn) {
            console.warn('[DEBUG] Failed to start audio generation.');
            await this.dumpState('audio_final_fail');
        }
    }
}
