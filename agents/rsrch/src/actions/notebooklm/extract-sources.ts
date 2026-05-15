import { UniversalContext, NotebookLMActionDeps } from '../types';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Extracts full text content from all sources in the notebook.
 * Returns metadata and paths for registry integration.
 */
export async function archiveNotebookSourcesAction(
    ctx: UniversalContext,
    deps: NotebookLMActionDeps,
    outputDir: string,
    format: 'md' | 'qmd' = 'md'
): Promise<{ title: string, path: string }[]> {
    const { page, log } = ctx;
    const { humanDelay } = deps;
    const extractedSources: { title: string, path: string }[] = [];
    const ext = format === 'qmd' ? 'qmd' : 'md';

    log('Starting full source content extraction...');

    // 1. Ensure we are in the sources list
    const sourcesHeader = page.locator('div').filter({ hasText: /^Zdroje$|^Sources$/ }).first();
    await sourcesHeader.click().catch(() => {});
    await humanDelay(500);

    // 2. Identify all source items
    const sourceItems = page.locator('source-list-item, [role="row"]');
    const count = await sourceItems.count();
    log(`Found ${count} sources to extract.`);

    const sourcesDir = path.join(outputDir, 'sources');
    if (!fs.existsSync(sourcesDir)) {
        fs.mkdirSync(sourcesDir, { recursive: true });
    }

    for (let i = 0; i < count; i++) {
        const item = sourceItems.nth(i);
        const title = await item.locator('.source-title-link, .title').first().innerText().catch(() => `Source_${i}`);
        log(`- Extracting source ${i + 1}/${count}: "${title}"`);

        try {
            // Click to open
            await item.locator('.source-title-link, .title').first().click();
            await humanDelay(2000);

            // Wait for detail view
            const scrollArea = page.locator('.scroll-area').first();
            await scrollArea.waitFor({ state: 'visible', timeout: 10000 });

            const content = await scrollArea.innerText();
            
            const fileName = `${title.replace(/[^a-z0-9]/gi, '_')}.${ext}`;
            const filePath = path.join(sourcesDir, fileName);

            fs.writeFileSync(filePath, content);
            extractedSources.push({ title, path: filePath });

            // Close detail view (return to list)
            const closeBtn = page.locator('button:has(mat-icon:has-text("collapse_content")), button:has(mat-icon:has-text("close")), button:has(mat-icon:has-text("arrow_back"))').first();
            if (await closeBtn.isVisible()) {
                await closeBtn.click();
            } else {
                // Try clicking the header again
                await sourcesHeader.click();
            }
            await humanDelay(1000);

        } catch (err: any) {
            log(`  Failed to extract source "${title}": ${err.message}`, 'warn');
            // Try to recover by clicking header
            await sourcesHeader.click().catch(() => {});
            await humanDelay(1000);
        }
    }

    return extractedSources;
}

/**
 * Extracts full text content from a specific single source.
 */
export async function downloadSourceAction(
    ctx: UniversalContext,
    deps: NotebookLMActionDeps,
    title: string,
    outputDir: string,
    format: 'md' | 'qmd' = 'md'
): Promise<string | null> {
    const { page, log } = ctx;
    const { humanDelay } = deps;
    const ext = format === 'qmd' ? 'qmd' : 'md';

    log(`Downloading source content: "${title}"...`);

    // 1. Ensure we are in the sources list
    const sourcesHeader = page.locator('div').filter({ hasText: /^Zdroje$|^Sources$/ }).first();
    await sourcesHeader.click().catch(() => {});
    await humanDelay(500);

    const sourceItem = page.locator('.single-source-container, source-list-item').filter({
        has: page.locator('.source-title, .title, span', { hasText: title })
    }).first();

    if (await sourceItem.count() === 0) {
        log(`Source "${title}" not found.`, 'error');
        return null;
    }

    try {
        const titleEl = sourceItem.locator('.source-title, .title').first();
        if (await titleEl.count() > 0) {
            await titleEl.click();
        } else {
            await sourceItem.click();
        }
        await humanDelay(2000);

        const scrollArea = page.locator('.scroll-area').first();
        await scrollArea.waitFor({ state: 'visible', timeout: 10000 });

        const content = await scrollArea.innerText();
        
        const fileName = `${title.replace(/[^a-z0-9]/gi, '_')}.${ext}`;
        const filePath = path.join(outputDir, fileName);

        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        fs.writeFileSync(filePath, content);

        // Close detail view
        const closeBtn = page.locator('button:has(mat-icon:has-text("collapse_content")), button:has(mat-icon:has-text("close")), button:has(mat-icon:has-text("arrow_back"))').first();
        if (await closeBtn.isVisible()) {
            await closeBtn.click();
        } else {
            await sourcesHeader.click();
        }
        await humanDelay(1000);

        return filePath;

    } catch (err: any) {
        log(`Failed to extract source "${title}": ${err.message}`, 'error');
        await sourcesHeader.click().catch(() => {});
        await humanDelay(1000);
        return null;
    }
}
