import { UniversalContext, GeminiActionDeps } from '../types';

/**
 * Scrolls the chat history to the top to ensure all historical messages
 * and artifacts are loaded into the DOM.
 * 
 * @param ctx UniversalContext
 * @param deps Dependencies
 */
export async function scrollToTopAction(
    ctx: UniversalContext,
    deps: GeminiActionDeps
): Promise<void> {
    const { page, log } = ctx;
    
    log('Scrolling to top of chat history to load all artifacts...');

    // Locate the scrollable container. 
    // Usually it's the main chat window or a specific history container.
    const container = page.locator('chat-window, .chat-history, [data-test-id="chat-history"]').first();
    
    let lastHeight = 0;
    let retries = 0;
    
    while (retries < 15) { // Limit to 15 scrolls to avoid infinite loops
        const currentHeight = await container.evaluate(el => el.scrollHeight).catch(() => 0);
        
        if (currentHeight === lastHeight) {
            retries++;
        } else {
            retries = 0;
            lastHeight = currentHeight;
        }

        // Scroll to the very top
        await container.evaluate(el => el.scrollTo(0, 0));
        await page.waitForTimeout(1000); // Wait for potential lazy loading

        // Check if a "load more" indicator or button exists
        const loadMore = page.locator('button:has-text("Load more"), button:has-text("Načíst další")').first();
        if (await loadMore.isVisible().catch(() => false)) {
            log('Clicking "Load more" button...');
            await loadMore.click();
            await page.waitForTimeout(1000);
        }
    }

    log('Finished scrolling to top.');
}
