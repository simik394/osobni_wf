import { UniversalContext, NotebookLMActionDeps } from './types';

/**
 * Lists notes from Google Keep.
 */
export async function listKeepNotesAction(
    ctx: UniversalContext,
    deps: NotebookLMActionDeps,
    options: { limit?: number; offset?: number; query?: string } = {}
): Promise<Array<{ title: string; content: string; tags: string[] }>> {
    const { page, log } = ctx;
    const { selectors } = deps;
    const { limit = 50, offset = 0, query } = options;

    log(`Listing Keep notes (Limit: ${limit}, Offset: ${offset}, Filter: ${query || 'None'})...`);

    try {
        await page.goto('https://keep.google.com');
        await page.waitForSelector(selectors.keep.noteItem, { timeout: 10000 });

        const results = new Map<string, { title: string; content: string; tags: string[] }>();
        let lastHeight = 0;
        let noNewCount = 0;
        const targetCount = offset + limit;

        while (results.size < targetCount && noNewCount < 5) {
            const currentNotes = await page.evaluate((sels) => {
                const items = document.querySelectorAll(sels.noteItem);
                return Array.from(items).map((item) => {
                    const title = item.querySelector(sels.noteTitle)?.textContent?.trim() || '';
                    const content = item.querySelector(sels.noteContent)?.textContent?.trim() || '';
                    // Extract tag chips
                    const tags = Array.from(item.querySelectorAll(sels.tagChip))
                        .map(el => el.textContent?.trim() || '')
                        .filter(Boolean);
                    return { title, content, tags };
                });
            }, selectors.keep);

            // Robust de-duplication using Map (title + content as key)
            currentNotes.forEach(note => {
                const key = `${note.title}|${note.content}`;
                if (key.trim() !== '|' && !results.has(key)) {
                    results.set(key, note);
                }
            });

            if (results.size >= targetCount) break;

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
            finalResults = finalResults.filter(n => regex.test(n.title) || regex.test(n.content) || (n.tags && n.tags.some(t => regex.test(t))));
        }

        log(`Successfully extracted ${finalResults.length} unique notes.`);
        return finalResults.slice(offset, offset + limit);
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
 * Reads detailed, un-truncated note content.
 */
export async function getKeepNoteAction(
    ctx: UniversalContext,
    deps: NotebookLMActionDeps,
    identifier: { title?: string; index?: number }
): Promise<{ title: string; content: string; tags: string[] } | null> {
    const { page, log } = ctx;
    const { selectors } = deps;

    try {
        await page.goto('https://keep.google.com');
        await page.waitForSelector(selectors.keep.noteItem, { timeout: 10000 });

        let noteLocator;
        if (identifier.index !== undefined) {
            const idx = identifier.index - 1; // 1-indexed to 0-indexed
            log(`Selecting note at index ${identifier.index}...`);
            noteLocator = page.locator(selectors.keep.noteItem).nth(idx);
        } else if (identifier.title) {
            log(`Selecting note by title: "${identifier.title}"...`);
            noteLocator = page.locator(selectors.keep.noteItem).filter({ hasText: identifier.title }).first();
        } else {
            throw new Error("Either title or index must be provided.");
        }

        if (!(await noteLocator.isVisible())) {
            log("Target note not visible/found.", "error");
            return null;
        }

        // Open detailed dialog modal
        await noteLocator.click();
        await page.waitForSelector(selectors.keep.noteWrapper, { timeout: 5000 });
        await page.waitForTimeout(500);

        const detailWrapper = page.locator(selectors.keep.noteWrapper);
        const title = await detailWrapper.locator(selectors.keep.titleInput).textContent() || '';
        const content = await detailWrapper.locator(selectors.keep.contentInput).textContent() || '';
        
        // Extract tags
        const tags = await detailWrapper.locator(selectors.keep.tagChip).evaluateAll(elements => 
            elements.map(el => el.textContent?.trim() || '').filter(Boolean)
        );

        // Close the note dialog
        const doneBtn = detailWrapper.locator(selectors.keep.saveButton).first();
        await doneBtn.click();
        await page.waitForTimeout(800);

        return { title: title.trim(), content: content.trim(), tags };
    } catch (e: any) {
        log(`Failed to get Keep note detail: ${e.message}`, 'error');
        return null;
    }
}

/**
 * Modifies/updates an existing note with default-append or replace.
 */
export async function updateKeepNoteAction(
    ctx: UniversalContext,
    deps: NotebookLMActionDeps,
    identifier: { title?: string; index?: number },
    updates: { newTitle?: string; newContent?: string; replace?: boolean }
): Promise<boolean> {
    const { page, log } = ctx;
    const { selectors } = deps;
    const { newTitle, newContent, replace = false } = updates;

    try {
        await page.goto('https://keep.google.com');
        await page.waitForSelector(selectors.keep.noteItem, { timeout: 10000 });

        let noteLocator;
        if (identifier.index !== undefined) {
            noteLocator = page.locator(selectors.keep.noteItem).nth(identifier.index - 1);
        } else if (identifier.title) {
            noteLocator = page.locator(selectors.keep.noteItem).filter({ hasText: identifier.title }).first();
        } else {
            throw new Error("Either title or index must be provided.");
        }

        if (!(await noteLocator.isVisible())) {
            log("Target note not visible/found.", "error");
            return false;
        }

        // Open detailed dialog modal
        await noteLocator.click();
        await page.waitForSelector(selectors.keep.noteWrapper, { timeout: 5000 });
        await page.waitForTimeout(500);

        const detailWrapper = page.locator(selectors.keep.noteWrapper);

        // Update Title if provided
        if (newTitle !== undefined) {
            const titleBox = detailWrapper.locator(selectors.keep.titleInput).first();
            await titleBox.click();
            await page.keyboard.press('Control+A');
            await page.keyboard.press('Backspace');
            await titleBox.fill(newTitle);
        }

        // Update Content if provided
        if (newContent !== undefined) {
            const contentBox = detailWrapper.locator(selectors.keep.contentInput).first();
            await contentBox.click();
            if (replace) {
                await page.keyboard.press('Control+A');
                await page.keyboard.press('Backspace');
                await contentBox.fill(newContent);
            } else {
                const currentVal = await contentBox.textContent() || '';
                const appendVal = currentVal ? `\n${newContent}` : newContent;
                await page.keyboard.press('Control+End');
                await contentBox.pressSequentially(appendVal);
            }
        }

        await page.waitForTimeout(500);

        // Save & Close
        const doneBtn = detailWrapper.locator(selectors.keep.saveButton).first();
        await doneBtn.click();
        await page.waitForTimeout(1000);

        return true;
    } catch (e: any) {
        log(`Failed to update Keep note: ${e.message}`, 'error');
        return false;
    }
}

/**
 * Manages tags/labels on a note card.
 */
export async function manageKeepLabelsAction(
    ctx: UniversalContext,
    deps: NotebookLMActionDeps,
    identifier: { title?: string; index?: number },
    labelName: string,
    action: 'add' | 'remove'
): Promise<boolean> {
    const { page, log } = ctx;
    const { selectors } = deps;

    try {
        await page.goto('https://keep.google.com');
        await page.waitForSelector(selectors.keep.noteItem, { timeout: 10000 });

        let noteLocator;
        if (identifier.index !== undefined) {
            noteLocator = page.locator(selectors.keep.noteItem).nth(identifier.index - 1);
        } else if (identifier.title) {
            noteLocator = page.locator(selectors.keep.noteItem).filter({ hasText: identifier.title }).first();
        } else {
            throw new Error("Either title or index must be provided.");
        }

        if (!(await noteLocator.isVisible())) {
            log("Target note not visible/found.", "error");
            return false;
        }

        // Open detailed dialog modal
        await noteLocator.click();
        await page.waitForSelector(selectors.keep.noteWrapper, { timeout: 5000 });
        await page.waitForTimeout(500);

        const detailWrapper = page.locator(selectors.keep.noteWrapper);

        // Click More Menu inside details dialog
        await detailWrapper.locator(selectors.keep.moreMenu).click();
        await page.waitForSelector(selectors.keep.menuOptionChangeLabels, { timeout: 3000 });

        // Click Change labels
        await page.locator(selectors.keep.menuOptionChangeLabels).click();
        await page.waitForSelector(selectors.keep.labelSearchInput, { timeout: 3000 });

        // Search label name
        const searchInput = page.locator(selectors.keep.labelSearchInput);
        await searchInput.fill(labelName);
        await page.waitForTimeout(500);

        // Find checkbox
        const checkbox = page.locator(selectors.keep.labelCheckbox).filter({ hasText: labelName }).first();
        if (await checkbox.isVisible()) {
            const isChecked = await checkbox.getAttribute('aria-checked') === 'true';
            if (action === 'add' && !isChecked) {
                await checkbox.click();
            } else if (action === 'remove' && isChecked) {
                await checkbox.click();
            }
        } else if (action === 'add') {
            // Create a new label
            const createBtn = page.locator('div[role="button"]:has-text("Vytvořit"), div[role="button"]:has-text("Create")').first();
            if (await createBtn.isVisible()) {
                await createBtn.click();
            }
        }

        // Close sub-menu
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);

        // Save & Close note dialog
        const doneBtn = detailWrapper.locator(selectors.keep.saveButton).first();
        await doneBtn.click();
        await page.waitForTimeout(1000);

        return true;
    } catch (e: any) {
        log(`Failed to manage Keep note labels: ${e.message}`, 'error');
        return false;
    }
}

/**
 * Performs OCR (Grab Image Text) on note's images.
 */
export async function grabKeepNoteImageTextAction(
    ctx: UniversalContext,
    deps: NotebookLMActionDeps,
    identifier: { title?: string; index?: number }
): Promise<boolean> {
    const { page, log } = ctx;
    const { selectors } = deps;

    try {
        await page.goto('https://keep.google.com');
        await page.waitForSelector(selectors.keep.noteItem, { timeout: 10000 });

        let noteLocator;
        if (identifier.index !== undefined) {
            noteLocator = page.locator(selectors.keep.noteItem).nth(identifier.index - 1);
        } else if (identifier.title) {
            noteLocator = page.locator(selectors.keep.noteItem).filter({ hasText: identifier.title }).first();
        } else {
            throw new Error("Either title or index must be provided.");
        }

        if (!(await noteLocator.isVisible())) {
            log("Target note not visible/found.", "error");
            return false;
        }

        // Open detailed dialog modal
        await noteLocator.click();
        await page.waitForSelector(selectors.keep.noteWrapper, { timeout: 5000 });
        await page.waitForTimeout(500);

        const detailWrapper = page.locator(selectors.keep.noteWrapper);

        // Click More Menu
        await detailWrapper.locator(selectors.keep.moreMenu).click();
        await page.waitForSelector(selectors.keep.menuOptionGrabText, { timeout: 3000 });

        // Click Grab image text
        await page.locator(selectors.keep.menuOptionGrabText).click();
        await page.waitForTimeout(3000);

        // Close note details dialog
        const doneBtn = detailWrapper.locator(selectors.keep.saveButton).first();
        await doneBtn.click();
        await page.waitForTimeout(1000);

        return true;
    } catch (e: any) {
        log(`Failed to grab image text: ${e.message}`, 'error');
        return false;
    }
}

/**
 * Adds a collaborator to the note.
 */
export async function addKeepCollaboratorAction(
    ctx: UniversalContext,
    deps: NotebookLMActionDeps,
    identifier: { title?: string; index?: number },
    email: string
): Promise<boolean> {
    const { page, log } = ctx;
    const { selectors } = deps;

    try {
        await page.goto('https://keep.google.com');
        await page.waitForSelector(selectors.keep.noteItem, { timeout: 10000 });

        let noteLocator;
        if (identifier.index !== undefined) {
            noteLocator = page.locator(selectors.keep.noteItem).nth(identifier.index - 1);
        } else if (identifier.title) {
            noteLocator = page.locator(selectors.keep.noteItem).filter({ hasText: identifier.title }).first();
        } else {
            throw new Error("Either title or index must be provided.");
        }

        if (!(await noteLocator.isVisible())) {
            log("Target note not visible/found.", "error");
            return false;
        }

        // Open detailed dialog modal
        await noteLocator.click();
        await page.waitForSelector(selectors.keep.noteWrapper, { timeout: 5000 });
        await page.waitForTimeout(500);

        const detailWrapper = page.locator(selectors.keep.noteWrapper);

        // Click Collaborators Button
        await detailWrapper.locator(selectors.keep.collaboratorButton).click();
        await page.waitForSelector(selectors.keep.collaboratorInput, { timeout: 3000 });

        // Fill email
        await page.locator(selectors.keep.collaboratorInput).fill(email);
        await page.waitForTimeout(500);

        // Click Save
        await page.locator(selectors.keep.collaboratorSave).click();
        await page.waitForTimeout(1000);

        // Close note details dialog
        const doneBtn = detailWrapper.locator(selectors.keep.saveButton).first();
        await doneBtn.click();
        await page.waitForTimeout(1000);

        return true;
    } catch (e: any) {
        log(`Failed to add collaborator: ${e.message}`, 'error');
        return false;
    }
}

/**
 * Sets a reminder on a note.
 */
export async function setKeepReminderAction(
    ctx: UniversalContext,
    deps: NotebookLMActionDeps,
    identifier: { title?: string; index?: number },
    reminderText: string
): Promise<boolean> {
    const { page, log } = ctx;
    const { selectors } = deps;

    try {
        await page.goto('https://keep.google.com');
        await page.waitForSelector(selectors.keep.noteItem, { timeout: 10000 });

        let noteLocator;
        if (identifier.index !== undefined) {
            noteLocator = page.locator(selectors.keep.noteItem).nth(identifier.index - 1);
        } else if (identifier.title) {
            noteLocator = page.locator(selectors.keep.noteItem).filter({ hasText: identifier.title }).first();
        } else {
            throw new Error("Either title or index must be provided.");
        }

        if (!(await noteLocator.isVisible())) {
            log("Target note not visible/found.", "error");
            return false;
        }

        // Open detailed dialog modal
        await noteLocator.click();
        await page.waitForSelector(selectors.keep.noteWrapper, { timeout: 5000 });
        await page.waitForTimeout(500);

        const detailWrapper = page.locator(selectors.keep.noteWrapper);

        // Click Reminder Button
        await detailWrapper.locator(selectors.keep.reminderButton).click();
        await page.waitForTimeout(500);

        let choiceText = "Dnes";
        if (reminderText === 'tomorrow') choiceText = "Zítra";
        else if (reminderText === 'next-week') choiceText = "Příští týden";
        else if (reminderText === 'today-en') choiceText = "Later today";
        else if (reminderText === 'tomorrow-en') choiceText = "Tomorrow";

        const option = page.locator(`div[role="menuitem"]:has-text("${choiceText}"), div[role="menuitem"]:has-text("${reminderText}")`).first();
        if (await option.isVisible()) {
            await option.click();
        } else {
            await page.locator('div[role="menuitem"]').first().click();
        }
        await page.waitForTimeout(500);

        // Close note details dialog
        const doneBtn = detailWrapper.locator(selectors.keep.saveButton).first();
        await doneBtn.click();
        await page.waitForTimeout(1000);

        return true;
    } catch (e: any) {
        log(`Failed to set reminder: ${e.message}`, 'error');
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

        const note = page.locator(selectors.keep.noteItem).filter({ hasText: title }).first();
        if (!(await note.isVisible())) {
            log(`Note with title "${title}" not found.`);
            return false;
        }

        await note.hover();
        const moreBtn = note.locator(selectors.keep.moreMenu);
        await moreBtn.click();

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
): Promise<Array<{ title: string; content: string; tags: string[] }>> {
    const { page, log } = ctx;
    const { selectors } = deps;

    log(`Searching Keep notes for: ${query}`);

    try {
        await page.goto('https://keep.google.com');
        const searchInput = page.locator(selectors.keep.searchInput);
        await searchInput.fill(query);
        await searchInput.press('Enter');

        await page.waitForTimeout(2000);

        const notes = await page.evaluate((sels) => {
            const items = document.querySelectorAll(sels.noteItem);
            return Array.from(items).map(item => {
                const title = item.querySelector(sels.noteTitle)?.textContent || '';
                const content = item.querySelector(sels.noteContent)?.textContent || '';
                const tags = Array.from(item.querySelectorAll(sels.tagChip))
                    .map(el => el.textContent?.trim() || '')
                    .filter(Boolean);
                return { title, content, tags };
            });
        }, selectors.keep);

        return notes;
    } catch (e: any) {
        log(`Failed to search Keep notes: ${e.message}`, 'error');
        return [];
    }
}
