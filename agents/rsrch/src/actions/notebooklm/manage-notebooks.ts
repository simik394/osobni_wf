import { UniversalContext, NotebookLMActionDeps } from '../types';
import { recycleAction } from './navigation';

export interface NotebookInfo {
    title: string;
    sourceCount: number;
    url?: string;
}

/**
 * Lists all notebooks from the home page.
 */
export async function listNotebooksAction(
    ctx: UniversalContext,
    deps: NotebookLMActionDeps
): Promise<NotebookInfo[]> {
    const { page, log } = ctx;
    const { selectors } = deps;

    log('Listing notebooks...');
    await recycleAction(ctx);

    try {
        await page.waitForSelector(`${selectors.home.projectButton}, ${selectors.home.projectCard}`, { 
            timeout: ctx.config.timeouts.navigation 
        });

        const cards = page.locator(`${selectors.home.projectButton}, ${selectors.home.projectCard}`);
        const count = await cards.count();
        log(`Found ${count} notebook cards.`);

        const notebooks: NotebookInfo[] = [];
        for (let i = 0; i < count; i++) {
            const card = cards.nth(i);
            const title = await card.locator(selectors.home.projectButtonTitle).first().innerText().catch(() => 'Untitled');
            const text = await card.innerText().catch(() => '');
            const match = text.match(/(\d+)\s*(zdroj|source)/i);
            const sourceCount = match ? parseInt(match[1]) : 0;
            
            notebooks.push({ title, sourceCount });
        }

        return notebooks;
    } catch (e: any) {
        log(`Failed to list notebooks: ${e.message}`, 'error');
        throw e;
    }
}

/**
 * Creates a new notebook.
 */
export async function createNotebookAction(
    ctx: UniversalContext,
    deps: NotebookLMActionDeps,
    title: string
): Promise<void> {
    const { page, log } = ctx;
    const { selectors } = deps;

    log(`Creating notebook: ${title}`);
    try {
        await recycleAction(ctx);

        const createBtnSelector = deps.selectors.home.createNewButton;
        await page.waitForSelector(createBtnSelector, { state: 'visible', timeout: 15000 });
        await page.click(createBtnSelector);

        const titleInputSelector = deps.selectors.notebook.titleInput;
        await page.waitForSelector(titleInputSelector, { state: 'visible', timeout: 15000 });

        await page.fill(titleInputSelector, title);
        await page.keyboard.press('Enter');

        // Wait for redirect to the new notebook
        await page.waitForURL(deps.selectors.notebook.urlPattern, { timeout: 15000 });
        log('Notebook created successfully.');
    } catch (e: any) {
        log(`Error creating notebook: ${e.message}`, 'error');
        if (deps.dumpState) await deps.dumpState('create_error');
        throw e;
    }
}
