import { UniversalContext, NotebookLMActionDeps } from '../types';

/**
 * Recycle the current tab back to the home page (notebook list) using UI navigation.
 */
export async function recycleAction(ctx: UniversalContext): Promise<void> {
    const { page, log, config } = ctx;
    const homeBtn = page.locator('a[href="/"], .notebook-logo, [aria-label*="NotebookLM"]').first();
    
    // If we're already on the home page (no /notebook/ in URL), we can skip
    const url = page.url();
    if (url.includes('notebooklm.google.com') && !url.includes('/notebook/')) {
        log('Already on home page, skip recycle.');
        return;
    }

    try {
        if (await homeBtn.count() > 0 && await homeBtn.isVisible()) {
            log('Clicking home button...');
            await homeBtn.click({ timeout: 3000 });
            await page.waitForURL(u => u.href.includes('notebooklm.google.com') && !u.href.includes('/notebook/'), { timeout: 3000 });
            log('Recycled successfully via UI.');
        } else {
            throw new Error('Home button not available');
        }
    } catch (e) {
        log('UI recycle failed or timed out, forcing goto().');
        await page.goto(config.urls.notebooklm, { waitUntil: 'networkidle', timeout: 30000 });
    }
    log('Recycle action finished.');
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

        log('Scrolling to find notebook card...');
        let lastCount = 0;
        let currentCount = await page.locator(selectors.home.projectButton).count();
        let attempts = 0;
        
        log('Searching for target notebook card...');
        const allCards = page.locator(selectors.home.projectButton);
        const allCount = await allCards.count();
        let targetCard = null;

        for (let i = 0; i < allCount; i++) {
            const card = allCards.nth(i);
            const cardTitle = await card.locator(selectors.home.projectButtonTitle).first().innerText().catch(() => '');
            
            // Clean titles for comparison (remove emojis, newlines, extra spaces)
            const cleanTarget = title.replace(/\s+/g, ' ').trim().toLowerCase();
            const cleanCard = cardTitle.replace(/\s+/g, ' ').trim().toLowerCase();
            
            if (cleanCard === cleanTarget || cleanCard.includes(cleanTarget) || cleanTarget.includes(cleanCard)) {
                log(`Found matching card: "${cardTitle}"`);
                targetCard = card;
                break;
            }
        }

        if (!targetCard) {
            throw new Error(`Notebook with title "${title}" not found in ${allCount} cards.`);
        }


        if (targetCard) {
            try {
                log('Attempting to open notebook...');
                // Try standard click first with a short timeout
                await targetCard.click({ timeout: 3000 });
            } catch (err) {
                log('Standard click failed or timed out, using JavaScript click...');
                await targetCard.evaluate((el: HTMLElement) => el.click());
            }
        }


        await page.waitForURL(selectors.notebook.urlPattern, { timeout: 15000 });
        log('Notebook opened successfully.');
    } catch (e: any) {
        log(`Failed to open notebook: ${e.message}`, 'error');
        throw e;
    }
}
