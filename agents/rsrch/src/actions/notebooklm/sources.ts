import { UniversalContext, NotebookLMActionDeps } from '../types';

/**
 * Ensures the 'Sources' tab is active.
 */
async function ensureSourcesTab(ctx: UniversalContext, deps: NotebookLMActionDeps): Promise<void> {
    const { page, log } = ctx;
    const { humanDelay } = deps;
    const sourcesTab = page.locator('div[role="tab"]').filter({ hasText: /Zdroje|Sources/i }).first();
    if (await sourcesTab.count() > 0 && await sourcesTab.isVisible()) {
        const isSelected = await sourcesTab.getAttribute('aria-selected') === 'true';
        if (!isSelected) {
            log('Switching to Sources tab...');
            await sourcesTab.click();
            await humanDelay(1000);
        }
    }
}

/**
 * Ensures the 'Add sources' dialog is open.
 */
async function ensureAddSourcesDialog(ctx: UniversalContext, deps: NotebookLMActionDeps): Promise<void> {
    const { page, log } = ctx;
    const { humanDelay } = deps;
    const dialogVisible = await page.locator('add-sources-dialog, mat-dialog-container:has(add-sources-dialog)').count() > 0;
    if (!dialogVisible) {
        const addSourceBtn = page.locator('button').filter({ hasText: /Přidat zdroje|Add sources/i }).first();
        if (await addSourceBtn.count() === 0) throw new Error('"Add sources" button not found');
        await addSourceBtn.click();
        await humanDelay(1500);
    }
}

/**
 * Selects specific sources in the current notebook.
 */
export async function selectSourcesAction(
    ctx: UniversalContext,
    deps: NotebookLMActionDeps,
    sources: string[] | string
): Promise<void> {
    const { page, log } = ctx;
    const { selectors, humanDelay } = deps;

    if (!sources || (Array.isArray(sources) && sources.length === 0)) {
        log('No specific sources provided, using default selection');
        return;
    }

    await ensureSourcesTab(ctx, deps);

    // Deselect all for clean slate
    const selectAllInput = page.locator('input[aria-label="Vybrat všechny zdroje"], input[aria-label="Select all sources"], input[name="allsources"]').first();
    if (await selectAllInput.count() > 0) {
        log('Resetting selection...');
        await selectAllInput.click();
        await humanDelay(500);
        await selectAllInput.click();
        await humanDelay(500);
    }

    if (typeof sources === 'string') {
        log('Index range selection not fully implemented in modular action yet.', 'warn');
    } else {
        log(`Selecting ${sources.length} sources by title...`);
        for (const title of sources) {
            const row = page.locator('source-list-item, [role="row"]').filter({ hasText: title }).first();
            const checkbox = row.locator('input[type="checkbox"], mat-checkbox').first();
            if (await checkbox.isVisible().catch(() => false)) {
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
    deps: NotebookLMActionDeps,
    filePath: string | string[]
): Promise<void> {
    const { page, log } = ctx;
    const { humanDelay } = deps;

    const pathsArr = Array.isArray(filePath) ? filePath : [filePath];
    log(`Uploading ${pathsArr.length} local files...`);

    await ensureSourcesTab(ctx, deps);
    await ensureAddSourcesDialog(ctx, deps);

    const fileChooserPromise = page.waitForEvent('filechooser', { timeout: 15000 });
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
    log('Files selected, waiting for upload...');

    await page.waitForSelector('mat-dialog-container', { state: 'hidden', timeout: 60000 });
    await humanDelay(2000);
}

/**
 * Gets all sources in the current notebook.
 */
export async function getSourcesAction(
    ctx: UniversalContext,
    deps: NotebookLMActionDeps
): Promise<Array<{ type: string; title: string; isSelected?: boolean; id?: string; url?: string }>> {
    const { page, log } = ctx;
    const sources: Array<{ type: string; title: string; isSelected?: boolean; id?: string; url?: string }> = [];

    await ensureSourcesTab(ctx, deps);

    const sourceItems = page.locator('.single-source-container, source-list-item').filter({
        has: page.locator('.source-title, .title')
    });

    const count = await sourceItems.count();
    log(`Found ${count} sources in list`);

    for (let i = 0; i < count; i++) {
        const item = sourceItems.nth(i);
        const titleEl = item.locator('.source-title, .title').first();
        const title = await titleEl.innerText().catch(() => '');

        const checkbox = item.locator('input[type="checkbox"]');
        let isSelected = false;
        if (await checkbox.count() > 0) {
            isSelected = await checkbox.isChecked().catch(() => false);
        } else {
            const ariaCheckbox = item.locator('[aria-checked="true"]');
            if (await ariaCheckbox.count() > 0) isSelected = true;
        }

        const html = await item.innerHTML().catch(() => '');
        let type = 'unknown';
        if (html.includes('link') || html.includes('web')) type = 'url';
        else if (html.includes('drive_spreadsheet')) type = 'gsheet';
        else if (html.includes('drive') || html.includes('doc')) type = 'gdoc';
        else if (html.includes('pdf')) type = 'pdf';
        else if (html.includes('text') || html.includes('article')) type = 'text';

        let id = undefined;
        const menuBtn = item.locator('button[id^="source-item-more-button-"]').first();
        if (await menuBtn.count() > 0) {
            const btnId = await menuBtn.getAttribute('id');
            if (btnId) id = btnId.replace('source-item-more-button-', '');
        }

        if (title.trim()) {
            sources.push({ type, title: title.trim(), isSelected, id });
        }
    }

    return sources;
}

/**
 * Gets sources with a preview of their content (AI summary + text snippet).
 */
export async function getSourcesPreviewAction(
    ctx: UniversalContext,
    deps: NotebookLMActionDeps,
    indices?: number[]
): Promise<Array<{ title: string; contentSnippet: string }>> {
    const { page, log } = ctx;
    const { humanDelay } = deps;
    const sourcesPreview: Array<{ title: string; contentSnippet: string }> = [];

    await ensureSourcesTab(ctx, deps);

    const sourcesHeader = page.locator('div').filter({ hasText: /^Zdroje$|^Sources$/ }).first();
    const sourceItems = page.locator('.single-source-container, source-list-item').filter({
        has: page.locator('.source-title, .title')
    });
    const count = await sourceItems.count();

    for (let i = 0; i < count; i++) {
        if (indices && indices.length > 0 && !indices.includes(i + 1)) {
            continue;
        }

        const item = sourceItems.nth(i);
        const titleEl = item.locator('.source-title, .title').first();
        const title = await titleEl.innerText().catch(() => `Source_${i}`);
        log(`Previewing source: ${title}`);

        try {
            await titleEl.click();
            await humanDelay(1500);

            const scrollArea = page.locator('.scroll-area').first();
            await scrollArea.waitFor({ state: 'visible', timeout: 5000 });

            const content = await scrollArea.innerText();
            const contentSnippet = content.substring(0, 1000) + (content.length > 1000 ? '...' : '');
            
            sourcesPreview.push({ title, contentSnippet });

            const closeBtn = page.locator('button:has(mat-icon:has-text("collapse_content")), button:has(mat-icon:has-text("close")), button:has(mat-icon:has-text("arrow_back"))').first();
            if (await closeBtn.isVisible()) {
                await closeBtn.click();
            } else {
                await sourcesHeader.click().catch(() => {});
            }
            await humanDelay(800);
        } catch (err: any) {
            log(`Failed to preview source "${title}": ${err.message}`, 'warn');
            sourcesPreview.push({ title, contentSnippet: '[Chyba při načítání náhledu]' });
            await sourcesHeader.click().catch(() => {});
            await humanDelay(800);
        }
    }

    return sourcesPreview;
}

/**
 * Deletes a source by title.
 */
export async function deleteSourceAction(
    ctx: UniversalContext,
    deps: NotebookLMActionDeps,
    title: string
): Promise<boolean> {
    const { page, log } = ctx;
    log(`Deleting source: "${title}"`);
    
    await ensureSourcesTab(ctx, deps);

    try {
        const item = page.locator('.single-source-container, source-list-item').filter({
            has: page.locator('.source-title, .title, span', { hasText: title })
        }).first();

        if (await item.count() === 0) {
            log(`Error: Source "${title}" not found.`, 'error');
            return false;
        }

        const moreBtn = item.locator('button').filter({
            has: page.locator('mat-icon', { hasText: 'more_vert' })
        }).first();

        await moreBtn.click();
        await deps.humanDelay(800);

        const deleteOption = page.locator('button[role="menuitem"]').filter({
            hasText: /Odstranit|Delete/i
        }).first();

        await deleteOption.click();
        await deps.humanDelay(1000);

        const confirmBtn = page.locator('mat-dialog-container button').filter({
            hasText: /Odstranit|Smazat|Delete/i
        }).first();
        
        if (await confirmBtn.count() > 0) {
            await confirmBtn.click();
            await deps.humanDelay(1500);
        }

        return true;
    } catch (e: any) {
        log(`Error deleting source: ${e.message}`, 'error');
        return false;
    }
}

/**
 * Renames a source.
 */
export async function renameSourceAction(
    ctx: UniversalContext,
    deps: NotebookLMActionDeps,
    oldTitle: string,
    newTitle: string
): Promise<boolean> {
    const { page, log } = ctx;
    log(`Renaming source: "${oldTitle}" to "${newTitle}"`);

    await ensureSourcesTab(ctx, deps);

    try {
        const item = page.locator('.single-source-container, source-list-item').filter({
            has: page.locator('.source-title, .title, span', { hasText: oldTitle })
        }).first();

        if (await item.count() === 0) {
            log(`Error: Source "${oldTitle}" not found.`, 'error');
            return false;
        }

        const moreBtn = item.locator('button').filter({
            has: page.locator('mat-icon', { hasText: 'more_vert' })
        }).first();

        await moreBtn.click();
        await deps.humanDelay(800);

        const renameOption = page.locator('button[role="menuitem"]').filter({
            hasText: /Přejmenovat|Rename/i
        }).first();

        await renameOption.click();
        await deps.humanDelay(1000);

        const input = page.locator('mat-dialog-container input').first();
        await input.fill(newTitle);
        await page.keyboard.press('Enter');
        await deps.humanDelay(1500);

        return true;
    } catch (e: any) {
        log(`Error renaming source: ${e.message}`, 'error');
        return false;
    }
}

/**
 * Adds a source URL.
 */
export async function addSourceUrlAction(
    ctx: UniversalContext,
    deps: NotebookLMActionDeps,
    url: string
): Promise<void> {
    const { page, log } = ctx;
    const { humanDelay, selectors } = deps;
    log(`Adding source URL: ${url}`);

    await ensureSourcesTab(ctx, deps);
    await ensureAddSourcesDialog(ctx, deps);

    const webBtn = page.locator('button.drop-zone-icon-button').filter({
        hasText: /Web|Internet|Language|Website/i
    }).first();

    if (await webBtn.count() > 0) {
        await webBtn.click();
    } else {
        const altWebBtn = page.locator('button').filter({ hasText: /web/i }).first();
        await altWebBtn.click();
    }

    await humanDelay(1000);
    const urlInput = page.locator('mat-dialog-container textarea').first();
    await urlInput.fill(url);
    await humanDelay(500);

    const submitBtn = page.locator('mat-dialog-container button').filter({ hasText: /Přidat|Add|Vložit/i }).first();
    await submitBtn.click();

    await page.waitForSelector('mat-dialog-container', { state: 'hidden', timeout: 15000 });
    await humanDelay(1500);
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

    log(`Adding pasted text source (${text.length} chars)...`);

    await ensureSourcesTab(ctx, deps);
    await ensureAddSourcesDialog(ctx, deps);

    const pasteBtn = page.locator('button.drop-zone-icon-button').filter({
        hasText: /Pasted text|Vložený text|Copied text|Text/i
    }).first();

    if (await pasteBtn.count() > 0) {
        await pasteBtn.click();
    } else {
        const iconBtn = page.locator('button.drop-zone-icon-button').filter({ has: page.locator('mat-icon', { hasText: /paste|article/ }) }).first();
        await iconBtn.click();
    }

    await humanDelay(1000);

    if (options.title) {
        const titleInput = page.locator('mat-dialog-container input[type="text"]').first();
        if (await titleInput.isVisible()) await titleInput.fill(options.title);
    }

    const textarea = page.locator('mat-dialog-container textarea').first();
    await textarea.fill(text);
    await humanDelay(500);

    const submitBtn = page.locator('mat-dialog-container button.mat-primary').first();
    await submitBtn.click();

    await page.waitForSelector('mat-dialog-container', { state: 'hidden', timeout: 15000 });
    await humanDelay(1500);
}

/**
 * Adds sources from Google Drive.
 */
export async function addDriveSourceAction(
    ctx: UniversalContext,
    deps: NotebookLMActionDeps,
    docNames: string[]
): Promise<void> {
    const { page, log } = ctx;
    const { humanDelay } = deps;

    log(`Adding Google Drive sources: ${docNames.join(', ')}`);

    await ensureSourcesTab(ctx, deps);
    await ensureAddSourcesDialog(ctx, deps);

    const driveBtn = page.locator('button.drop-zone-icon-button').filter({ hasText: /Disk|Drive/i }).first();
    if (await driveBtn.count() > 0) {
        await driveBtn.click();
    } else {
        await page.locator('button').filter({ hasText: /disk/i }).click();
    }

    await humanDelay(3000);

    const pickerFrame = page.frameLocator('iframe[src*="picker"]').first();
    
    for (const docName of docNames) {
        log(`Searching for: ${docName}`);
        const searchInput = pickerFrame.locator('input[type="text"]').first();
        await searchInput.fill(docName);
        await page.keyboard.press('Enter');
        await humanDelay(3000);

        const fileRow = pickerFrame.locator('[role="option"]').filter({ hasText: docName }).first();
        if (await fileRow.count() > 0) {
            await fileRow.click();
        }
        await humanDelay(1000);
    }

    const selectBtn = page.locator('button').filter({ hasText: /Vybrat|Select/i }).first();
    if (await selectBtn.count() > 0) await selectBtn.click();

    await page.waitForSelector('mat-dialog-container', { state: 'hidden', timeout: 15000 }).catch(() => {});
}
