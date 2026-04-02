import { UniversalContext, NotebookLMActionDeps } from '../types';

export async function addSourceUrlAction(
    ctx: UniversalContext,
    deps: NotebookLMActionDeps,
    url: string
): Promise<void> {
    const { page, log } = ctx;
    log(`Adding source URL: ${url}`);

    const sourcesTab = page.locator(deps.selectors.sources.tab).filter({ hasText: new RegExp(deps.selectors.sources.tabTextPattern, 'i') }).first();
    if (await sourcesTab.count() > 0 && await sourcesTab.isVisible()) {
        const isSelected = await sourcesTab.getAttribute('aria-selected') === 'true';
        if (!isSelected) {
            log('[DEBUG] Switching to Sources tab...');
            await sourcesTab.click();
            await deps.humanDelay(1000);
        }
    }

    const sourceBtn = await page.evaluateHandle((args) => {
        const { buttonSelector, pattern } = args;
        const buttons = Array.from(document.querySelectorAll(buttonSelector));
        const regex = new RegExp(pattern, 'i');
        return buttons.find(b => {
            const text = b.textContent?.toLowerCase() || '';
            return regex.test(text);
        });
    }, {
        buttonSelector: deps.selectors.sources.dropZoneButton,
        pattern: deps.selectors.sources.webSourcePattern
    });

    if (!sourceBtn) {
        throw new Error('Website source button not found');
    }

    await sourceBtn.asElement()?.click();

    const urlInputSelector = deps.selectors.sources.urlInputTextarea;
    try {
        await page.waitForSelector(urlInputSelector, { timeout: 5000 });
        await page.fill(urlInputSelector, url);

        const submitSelector = deps.selectors.sources.submitButton;
        await page.waitForFunction((sel: string) => {
            const btn = document.querySelector(sel);
            return btn && !btn.classList.contains('mat-mdc-button-disabled') && !btn.hasAttribute('disabled');
        }, submitSelector, { timeout: 5000 });

        await page.click(submitSelector);

        await page.waitForSelector(deps.selectors.sources.dialogContainer, { state: 'hidden', timeout: 5000 });

    } catch (e) {
        console.error('Failed to fill URL source dialog', e);
        throw e;
    }
}

/**
 * Adds a text source to the notebook.
 */
export async function addTextSourceAction(
    ctx: UniversalContext,
    deps: NotebookLMActionDeps,
    text: string,
    options: { title?: string; notebookTitle?: string } = {}
): Promise<void> {
    const { page, log } = ctx;
    const { humanDelay } = deps;
    const { openNotebookAction } = await import('./navigation');

    if (options.notebookTitle) {
        await openNotebookAction(ctx, deps, options.notebookTitle);
    }

    log(`Adding pasted text source (${text.length} chars)...`);

    const sourcesTab = page.locator('div[role="tab"]').filter({ hasText: /Zdroje|Sources/i }).first();
    if (await sourcesTab.count() > 0 && await sourcesTab.isVisible()) {
        const isSelected = await sourcesTab.getAttribute('aria-selected') === 'true';
        if (!isSelected) {
            log('[DEBUG] Switching to Sources tab...');
            await sourcesTab.click();
            if (deps) await deps.humanDelay(1000);
        }
    }

    const addSourceBtn = page.locator('button').filter({ hasText: /Přidat zdroje|Add sources/i }).first();
    if (await addSourceBtn.count() === 0) {
        throw new Error('"Add sources" button not found');
    }
    await addSourceBtn.click();
    if (deps) await deps.humanDelay(1000);

    const pasteBtn = page.locator('button.drop-zone-icon-button').filter({
        hasText: /Pasted text|Vložený text|Copied text|Zkopírovaný text|Text/i
    }).first();

    if (await pasteBtn.count() === 0) {
        const altPasteBtn = page.locator('button.drop-zone-icon-button').filter({
            hasText: /content_paste|paste/i
        }).first();

        if (await altPasteBtn.count() > 0) {
            await altPasteBtn.click();
        } else {
            const allBtns = page.locator('button.drop-zone-icon-button');
            const count = await allBtns.count();
            log(`[DEBUG] Available source buttons (${count}):`);
            for (let i = 0; i < count; i++) {
                const btnText = await allBtns.nth(i).innerText();
                log(`  - ${btnText}`);
            }
            throw new Error('"Pasted text" source button not found');
        }
    } else {
        await pasteBtn.click();
    }

    await humanDelay(1000);

    if (options.title) {
        const titleInput = page.locator('mat-dialog-container input[type="text"], mat-dialog-container input.title-input').first();
        if (await titleInput.count() > 0 && await titleInput.isVisible()) {
            await titleInput.fill(options.title);
            log(`[DEBUG] Set source title: ${options.title}`);
        }
    }

    const textareaSelector = 'mat-dialog-container textarea';
    try {
        await page.waitForSelector(textareaSelector, { timeout: 5000 });
        await page.fill(textareaSelector, text);
        log(`[DEBUG] Filled text content (${text.length} chars)`);

        const submitSelector = 'mat-dialog-container button.mat-primary';
        await page.waitForFunction((sel: string) => {
            const btn = document.querySelector(sel);
            return btn && !btn.classList.contains('mat-mdc-button-disabled') && !btn.hasAttribute('disabled');
        }, submitSelector, { timeout: 5000 });

        await page.click(submitSelector);

        await page.waitForSelector('mat-dialog-container', { state: 'hidden', timeout: 10000 });
        log('[DEBUG] Pasted text added successfully');

    } catch (e: any) {
        console.error('Failed to fill pasted text source dialog:', e.message);
        throw e;
    }
}

/**
 * Adds sources from Google Drive.
 */
export async function addDriveSourceAction(
    ctx: UniversalContext,
    deps: NotebookLMActionDeps,
    docNames: string[],
    notebookTitle?: string
): Promise<void> {
    const { page, log } = ctx;
    const { humanDelay } = deps;
    const { openNotebookAction } = await import('./navigation');

    if (notebookTitle) {
        await openNotebookAction(ctx, deps, notebookTitle);
    }

    log(`[DEBUG] Adding Google Drive sources: ${docNames.join(', ')}`);

    const sourcesTab = page.locator('div[role="tab"]').filter({ hasText: /Zdroje|Sources/i }).first();
    if (await sourcesTab.count() > 0 && await sourcesTab.isVisible()) {
        const isSelected = await sourcesTab.getAttribute('aria-selected') === 'true';
        if (!isSelected) {
            log('[DEBUG] Switching to Sources tab...');
            await sourcesTab.click();
            if (deps) await deps.humanDelay(1000);
        }
    }

    const addSourceBtn = page.locator('button').filter({ hasText: /Přidat zdroje|Add sources/i }).first();
    if (await addSourceBtn.count() === 0) {
        throw new Error('"Add sources" button not found');
    }
    await addSourceBtn.click();
    if (deps) await deps.humanDelay(1000);

    const driveBtn = page.locator('button.drop-zone-icon-button').filter({ hasText: /Disk|Drive/i }).first();
    if (await driveBtn.count() === 0) {
        const altDriveBtn = page.getByText('Disk').first();
        if (await altDriveBtn.count() > 0) {
            await altDriveBtn.click();
        } else {
            throw new Error('Google Drive button not found');
        }
    } else {
        await driveBtn.click();
    }

    await humanDelay(3000);

    const pickerFrame = page.locator('iframe').first();
    if (await pickerFrame.count() === 0) {
        throw new Error('Google Drive picker iframe not found');
    }

    for (const docName of docNames) {
        log(`[DEBUG] Searching for document: ${docName}`);
        
        const searchInput = pickerFrame.locator('input[type="text"]').first();
        await searchInput.fill(docName);
        await page.keyboard.press('Enter');
        
        await humanDelay(3000);

        const fileRow = pickerFrame.locator('div[role="option"], div[role="row"]').filter({ hasText: docName }).first();
        if (await fileRow.count() > 0) {
            await fileRow.click();
            log(`[DEBUG] Selected document: ${docName}`);
        } else {
            log(`[WARN] Document not found in Drive: ${docName}`);
        }
        
        await humanDelay(1000);
    }

    const selectBtn = page.locator('button').filter({ hasText: /Vybrat|Select/i }).first();
    if (await selectBtn.count() > 0) {
        await selectBtn.click();
        log('[DEBUG] Clicked Select button');
    } else {
        const frameSelectBtn = pickerFrame.locator('button, div[role="button"]').filter({ hasText: /Vybrat|Select/i }).first();
        if (await frameSelectBtn.count() > 0) {
            await frameSelectBtn.click();
            log('[DEBUG] Clicked Select button in iframe');
        } else {
            log('[WARN] Could not find Select button');
        }
    }

    await page.waitForSelector('mat-dialog-container', { state: 'hidden', timeout: 15000 }).catch(() => {
        log('[WARN] Dialog did not close within timeout, assuming success if no errors shown');
    });
}
