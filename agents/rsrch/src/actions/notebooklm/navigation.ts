import { UniversalContext, NotebookLMActionDeps } from '../types';

/**
 * Recycle the current tab back to the home page (notebook list) using UI navigation.
 */
export async function recycleAction(ctx: UniversalContext): Promise<void> {
    const { page, log, config } = ctx;
    log('Recycling NotebookLM tab via UI...');
    
    const homeBtn = page.locator('a[href="/"], .notebook-logo, [aria-label*="NotebookLM"]').first();
    if (await homeBtn.count() > 0 && await homeBtn.isVisible()) {
        await homeBtn.click();
        try {
            await page.waitForURL(url => url.href.includes('notebooklm.google.com') && !url.href.includes('/notebook/'), { timeout: 5000 });
            log('Recycled successfully via UI.');
        } catch (e) {
            log('UI recycle timed out, falling back to goto().');
            await page.goto(config.urls.notebooklm, { waitUntil: 'domcontentloaded' });
        }
    } else {
        log('Home button not found, falling back to goto().');
        await page.goto(config.urls.notebooklm, { waitUntil: 'domcontentloaded' });
    }
}

/**
 * Opens a specific notebook by title.
 */
export async function openNotebookAction(
    ctx: UniversalContext,
    deps: NotebookLMActionDeps,
    title: string
): Promise<void> {
    const { page, log } = ctx;
    const { selectors } = deps;

    log(`Opening notebook: "${title}"`);

    const currentUrl = page.url();
    if (currentUrl.includes('/notebook/')) {
        const pageTitle = await page.title().catch(() => '');
        if (pageTitle && (pageTitle.includes(title) || (title.length > 30 && pageTitle.includes(title.substring(0, 25))))) {
            log('Already on the right notebook, skipping navigation');
            return;
        }
        log('On different notebook, navigating to home first...');
    }

    await recycleAction(ctx);

    try {
        await page.waitForSelector(`${selectors.home.projectButton}, ${selectors.home.projectCard}`, { timeout: ctx.config.timeouts.navigation });

        const candidates = page.locator(selectors.home.projectButton).filter({ 
            has: page.locator(selectors.home.projectButtonTitle, { hasText: title }) 
        });
        const count = await candidates.count();
        
        let targetCard = null;
        if (count === 0) {
            const looseCandidates = page.locator(`${selectors.home.projectButton}, ${selectors.home.projectCard}`).filter({ hasText: title });
            if (await looseCandidates.count() > 0) {
                targetCard = looseCandidates.first();
            } else {
                throw new Error(`Notebook with title "${title}" not found.`);
            }
        } else if (count > 1) {
            log(`Found ${count} candidates. Picking the one with most sources...`);
            let bestIdx = 0;
            let maxSources = -1;
            for (let i = 0; i < count; i++) {
                const text = await candidates.nth(i).innerText().catch(() => '');
                const match = text.match(/(\d+)\s*(zdroj|source)/i);
                const sourceCount = match ? parseInt(match[1]) : 0;
                if (sourceCount > maxSources) {
                    maxSources = sourceCount;
                    bestIdx = i;
                }
            }
            targetCard = candidates.nth(bestIdx);
        } else {
            targetCard = candidates.first();
        }

        if (targetCard) {
            const actionBtn = targetCard.locator(selectors.home.primaryActionButton).first();
            if (await actionBtn.count() > 0 && await actionBtn.isVisible()) {
                await actionBtn.click();
            } else {
                await targetCard.click();
            }
        }

        await page.waitForURL(selectors.notebook.urlPattern, { timeout: 15000 });
        log('Notebook opened successfully.');
    } catch (e: any) {
        log(`Failed to open notebook: ${e.message}`, 'error');
        throw e;
    }
}
