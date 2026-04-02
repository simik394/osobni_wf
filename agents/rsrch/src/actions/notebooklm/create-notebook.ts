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
        // EFFICIENT RECYCLING
        const currentUrl = page.url();
        if (!currentUrl.includes('notebooklm.google.com') || currentUrl.includes('/notebook/')) {
            log('Navigating to home via UI/goto fallback...');
            const homeBtn = page.locator('a[href="/"], .notebook-logo, [aria-label*="NotebookLM"]').first();
            if (await homeBtn.count() > 0 && await homeBtn.isVisible()) {
                await homeBtn.click();
                try {
                    await page.waitForURL(url => url.href.includes('notebooklm.google.com') && !url.href.includes('/notebook/'), { timeout: 5000 });
                } catch (e) {
                    await page.goto(ctx.config.urls.notebooklm, { waitUntil: 'domcontentloaded' });
                }
            } else {
                await page.goto(ctx.config.urls.notebooklm, { waitUntil: 'domcontentloaded' });
            }
        }

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
