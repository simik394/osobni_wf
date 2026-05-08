import { UniversalContext, NotebookLMActionDeps } from './types';

/**
 * Lists notes from Google Keep.
 */
export async function listKeepNotesAction(
    ctx: UniversalContext,
    deps: NotebookLMActionDeps
): Promise<Array<{ title: string; content: string }>> {
    const { page, log } = ctx;
    const { selectors } = deps;

    log('Listing Keep notes...');

    try {
        await page.goto('https://keep.google.com');
        await page.waitForSelector(selectors.keep.noteItem, { timeout: 10000 });

        const notes = await page.evaluate((sels) => {
            const items = document.querySelectorAll(sels.noteItem);
            return Array.from(items).map(item => {
                const title = item.querySelector(sels.noteTitle)?.textContent || '';
                const content = item.querySelector(sels.noteContent)?.textContent || '';
                return { title, content };
            });
        }, selectors.keep);

        return notes;
    } catch (e: any) {
        log(`Failed to list Keep notes: ${e.message}`, 'error');
        return [];
    }
}

/**
 * Creates a new note in Google Keep.
 */
export async function createKeepNoteAction(
    ctx: UniversalContext,
    deps: NotebookLMActionDeps,
    title: string,
    content: string
): Promise<boolean> {
    const { page, log } = ctx;
    const { selectors } = deps;

    log(`Creating Keep note: ${title}`);

    try {
        await page.goto('https://keep.google.com');
        
        // Click "Take a note..."
        const input = page.locator(selectors.keep.noteInput).first();
        await input.click();
        await page.waitForTimeout(500);

        // Fill title
        const titleBox = page.locator(selectors.keep.titleInput).first();
        if (await titleBox.isVisible()) {
            await titleBox.fill(title);
        }

        // Fill content
        const contentBox = page.locator(selectors.keep.contentInput).last();
        await contentBox.fill(content);
        
        await page.waitForTimeout(500);

        // Click Done
        const doneBtn = page.locator(selectors.keep.saveButton).first();
        await doneBtn.click();
        
        await page.waitForTimeout(1000);
        return true;
    } catch (e: any) {
        log(`Failed to create Keep note: ${e.message}`, 'error');
        return false;
    }
}
