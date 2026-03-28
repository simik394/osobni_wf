import { UniversalContext, NotebookLMActionDeps } from '../types';

/**
 * Selects specific sources in the current notebook.
 * 
 * @param ctx UniversalContext
 * @param deps Dependencies including humanDelay
 * @param sources Array of titles or index range string (e.g., "1,3,5-8")
 */
export async function selectSourcesAction(
    ctx: UniversalContext,
    deps: NotebookLMActionDeps & { humanDelay: (ms: number) => Promise<void> },
    sources: string[] | string
): Promise<void> {
    const { page, log } = ctx;
    const { selectors, humanDelay } = deps;

    if (!sources || (Array.isArray(sources) && sources.length === 0)) {
        log('No specific sources provided, using default selection');
        return;
    }

    log(`Selecting sources: ${JSON.stringify(sources)}`);

    // Switch to Sources tab
    const sourcesTab = page.locator('div[role="tab"]').filter({ hasText: /Zdroje|Sources/i }).first();
    if (await sourcesTab.count() > 0 && await sourcesTab.isVisible()) {
        const isSelected = await sourcesTab.getAttribute('aria-selected') === 'true';
        if (!isSelected) {
            await sourcesTab.click();
            await humanDelay(1000);
        }
    }

    // Deselect all for clean slate
    const selectAllInput = page.locator('input[aria-label="Vybrat všechny zdroje"], input[aria-label="Select all sources"], input[name="allsources"]').first();

    if (await selectAllInput.count() > 0) {
        log('Resetting selection...');
        // Toggle twice to ensure clean slate
        await selectAllInput.click();
        await humanDelay(500);
        await selectAllInput.click();
        await humanDelay(500);
    }

    if (typeof sources === 'string') {
        // Handle index range? For simplicity, we mostly use name matching in actions.
        log('Index range selection not fully implemented in modular action yet.', 'warn');
    } else {
        log(`Selecting ${sources.length} sources by title...`);
        for (const title of sources) {
            const row = page.locator('source-list-item, [role="row"]').filter({ hasText: title }).first();
            const checkbox = row.locator('input[type="checkbox"], mat-checkbox').first();
            if (await checkbox.isVisible()) {
                await checkbox.click();
                await humanDelay(300);
            }
        }
    }
}

/**
 * Uploads local files as sources.
 */
export async function uploadLocalFileAction(
    ctx: UniversalContext,
    deps: NotebookLMActionDeps & { humanDelay: (ms: number) => Promise<void> },
    filePath: string | string[]
): Promise<void> {
    const { page, log } = ctx;
    const { selectors, humanDelay } = deps;

    const pathsArr = Array.isArray(filePath) ? filePath : [filePath];
    log(`Uploading ${pathsArr.length} local files...`);

    // Ensure Sources tab
    const sourcesTab = page.locator('div[role="tab"]').filter({ hasText: /Zdroje|Sources/i }).first();
    if (await sourcesTab.count() > 0) {
        const isSelected = await sourcesTab.getAttribute('aria-selected') === 'true';
        if (!isSelected) {
            await sourcesTab.click();
            await humanDelay(1000);
        }
    }

    // Check dialog
    const dialogVisible = await page.locator('add-sources-dialog, mat-dialog-container:has(add-sources-dialog)').count() > 0;
    if (!dialogVisible) {
        const addSourceBtn = page.locator('button').filter({ hasText: /Přidat zdroje|Add sources/i }).first();
        if (await addSourceBtn.count() === 0) throw new Error('"Add sources" button not found');
        await addSourceBtn.click();
        await humanDelay(1000);
    }

    const fileChooserPromise = page.waitForEvent('filechooser', { timeout: 10000 });
    const dialogLocator = page.locator('add-sources-dialog').first();
    const selectLink = dialogLocator.locator('span.select-files-link, a:has-text("vyberte"), a:has-text("select")').first();
    const uploadBtn = dialogLocator.locator('button').filter({ hasText: /Nahrát soubor|Upload file|Upload/i }).first();

    if (await selectLink.count() > 0 && await selectLink.isVisible()) {
        await selectLink.click();
    } else if (await uploadBtn.count() > 0 && await uploadBtn.isVisible()) {
        await uploadBtn.click();
    } else {
        const dropZone = dialogLocator.locator('.drop-zone, [class*="drop-zone"]').first();
        await dropZone.click();
    }

    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(pathsArr);
    log('Files selected.');

    await page.waitForSelector('mat-dialog-container', { state: 'hidden', timeout: 60000 });
    await humanDelay(2000);
}
