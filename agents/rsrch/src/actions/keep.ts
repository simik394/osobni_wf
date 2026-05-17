import { UniversalContext, NotebookLMActionDeps } from './types';

/**
 * Lists notes from Google Keep.
 */
export async function listKeepNotesAction(
    ctx: UniversalContext,
    deps: NotebookLMActionDeps,
    options: { limit?: number; query?: string } = {}
): Promise<Array<{ title: string; content: string }>> {
    const { page, log } = ctx;
    const { selectors } = deps;
    const { limit = 50, query } = options;

    log(`Listing Keep notes (Limit: ${limit}, Filter: ${query || 'None'})...`);

    try {
        await page.goto('https://keep.google.com');
        await page.waitForSelector(selectors.keep.noteItem, { timeout: 10000 });

        const results = new Map<string, { title: string; content: string }>();
        let lastHeight = 0;
        let noNewCount = 0;

        while (results.size < limit && noNewCount < 5) {
            const currentNotes = await page.evaluate((sels) => {
                const items = document.querySelectorAll(sels.noteItem);
                return Array.from(items).map((item) => {
                    const title = item.querySelector(sels.noteTitle)?.textContent?.trim() || '';
                    const content = item.querySelector(sels.noteContent)?.textContent?.trim() || '';
                    return { title, content };
                });
            }, selectors.keep);

            // Robust de-duplication using Map (title + content as key)
            currentNotes.forEach(note => {
                const key = `${note.title}|${note.content}`;
                if (key.trim() !== '|' && !results.has(key)) {
                    results.set(key, note);
                }
            });

            if (results.size >= limit) break;

            const currentHeight = await page.evaluate(() => document.body.scrollHeight);
            if (currentHeight === lastHeight) {
                noNewCount++;
            } else {
                noNewCount = 0;
                lastHeight = currentHeight;
            }

            // Professional Scroll & Wait strategy
            await page.evaluate(() => window.scrollBy(0, window.innerHeight));
            await page.waitForTimeout(800);
            
            if (noNewCount >= 5) break;
        }

        let finalResults = Array.from(results.values());

        // Apply professional regex filtering if query provided
        if (query) {
            const regex = new RegExp(query, 'i');
            finalResults = finalResults.filter(n => regex.test(n.title) || regex.test(n.content));
        }

        log(`Successfully extracted ${finalResults.length} unique notes.`);
        return finalResults.slice(0, limit);
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

/**
 * Deletes a note in Google Keep by its title (first match).
 */
export async function deleteKeepNoteAction(
    ctx: UniversalContext,
    deps: NotebookLMActionDeps,
    title: string
): Promise<boolean> {
    const { page, log } = ctx;
    const { selectors } = deps;

    log(`Deleting Keep note: ${title}`);

    try {
        await page.goto('https://keep.google.com');
        await page.waitForSelector(selectors.keep.noteItem);

        // Find the note by title
        const note = page.locator(selectors.keep.noteItem).filter({ hasText: title }).first();
        if (!(await note.isVisible())) {
            log(`Note with title "${title}" not found.`);
            return false;
        }

        // Hover to reveal "More" menu
        await note.hover();
        const moreBtn = note.locator(selectors.keep.moreMenu);
        await moreBtn.click();

        // Click Delete
        await page.locator(selectors.keep.deleteOption).click();
        
        await page.waitForTimeout(1000);
        return true;
    } catch (e: any) {
        log(`Failed to delete Keep note: ${e.message}`, 'error');
        return false;
    }
}

/**
 * Archives a note in Google Keep by its title (first match).
 */
export async function archiveKeepNoteAction(
    ctx: UniversalContext,
    deps: NotebookLMActionDeps,
    title: string
): Promise<boolean> {
    const { page, log } = ctx;
    const { selectors } = deps;

    log(`Archiving Keep note: ${title}`);

    try {
        await page.goto('https://keep.google.com');
        await page.waitForSelector(selectors.keep.noteItem);

        const note = page.locator(selectors.keep.noteItem).filter({ hasText: title }).first();
        if (!(await note.isVisible())) return false;

        await note.hover();
        await note.locator(selectors.keep.archiveButton).click();
        
        await page.waitForTimeout(1000);
        return true;
    } catch (e: any) {
        log(`Failed to archive Keep note: ${e.message}`, 'error');
        return false;
    }
}

/**
 * Searches for notes in Google Keep.
 */
export async function searchKeepNotesAction(
    ctx: UniversalContext,
    deps: NotebookLMActionDeps,
    query: string
): Promise<Array<{ title: string; content: string }>> {
    const { page, log } = ctx;
    const { selectors } = deps;

    log(`Searching Keep notes for: ${query}`);

    try {
        await page.goto('https://keep.google.com');
        const searchInput = page.locator(selectors.keep.searchInput);
        await searchInput.fill(query);
        await searchInput.press('Enter');

        await page.waitForTimeout(2000); // Wait for results

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
        log(`Failed to search Keep notes: ${e.message}`, 'error');
        return [];
    }
}
