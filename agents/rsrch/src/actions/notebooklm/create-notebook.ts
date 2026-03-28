import { UniversalContext } from '../types';

export async function createNotebookAction(
    ctx: UniversalContext,
    title: string,
    deps: {
        selectors: any;
        dumpState: (prefix: string) => Promise<any>;
    }
): Promise<void> {
    const { page, log } = ctx;

    log(`Creating notebook: ${title}`);
    try {
        await page.goto('https://notebooklm.google.com/', { waitUntil: 'domcontentloaded' });

        const createBtnSelector = deps.selectors.home.createNewButton;
        await page.waitForSelector(createBtnSelector, { state: 'visible', timeout: 15000 });

        await page.click(createBtnSelector);

        const titleInputSelector = deps.selectors.notebook.titleInput;
        await page.waitForSelector(titleInputSelector, { state: 'visible', timeout: 15000 });

        await page.fill(titleInputSelector, title);
        await page.keyboard.press('Enter');

        await page.waitForTimeout(2000);
    } catch (e: any) {
        log(`Error creating notebook: ${e.message}`);
        await deps.dumpState('create_error');
        throw e;
    }
}
