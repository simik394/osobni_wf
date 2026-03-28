import { UniversalContext, NotebookLMActionDeps } from '../types';

/**
 * Opens a specific notebook by title.
 * 
 * @param ctx UniversalContext
 * @param deps Dependencies including selectors
 * @param title Notebook title
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

    await page.goto('https://notebooklm.google.com/', { waitUntil: 'domcontentloaded' });

    try {
        await page.waitForSelector(`${selectors.home.projectButton}, ${selectors.home.projectCard}`, { timeout: 20000 });

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
