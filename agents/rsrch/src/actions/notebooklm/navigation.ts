import { UniversalContext, NotebookLMActionDeps } from '../types';
import { ensureAuthAction } from './auth';

/**
 * Recycle the current tab back to the home page (notebook list) using UI navigation.
 */
export async function recycleAction(
    ctx: UniversalContext,
    deps: NotebookLMActionDeps
): Promise<void> {
    const { page, log, config } = ctx;
    const { selectors } = deps;
    
    // Ensure we are not stuck at auth page
    await ensureAuthAction(ctx, deps);

    const homeBtn = page.locator('a[href="/"], .notebook-logo, [aria-label*="NotebookLM"]').first();
    
    // If we're already on the home page (no /notebook/ in URL), we can skip
    const url = page.url();
    try {
        const parsedUrl = new URL(url);
        if (parsedUrl.hostname === 'notebooklm.google.com' && 
            (parsedUrl.pathname === '/' || parsedUrl.pathname === '') && 
            !url.includes('login')) {
            log('Already on home page, skip recycle.');
            return;
        }
    } catch (e) {
        // Fallback to full recycle if URL is invalid or unexpected
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

    await recycleAction(ctx, deps);

    try {
        await page.waitForSelector(selectors.home.projectButton, { timeout: ctx.config.timeouts.navigation });

        log('Scrolling to find notebook card...');
        let lastCount = 0;
        let currentCount = await page.locator(selectors.home.projectButton).count();
        let attempts = 0;
        
        const escapedTitle = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
        const targetCard = page.locator(selectors.home.projectButton).filter({ hasText: new RegExp(escapedTitle, 'i') }).first();
        
        if (await targetCard.count() === 0) {
            const allCount = await page.locator(selectors.home.projectButton).count();
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
        // Try to dump state for debugging
        try {
            const client = new (await import('../../clients/notebooklm')).NotebookLMClient(page);
            await client.dumpState('failed_open_notebook');
        } catch (dumpErr) {}
        throw e;
    }
}
