import { UniversalContext, GeminiActionDeps } from '../types';

/**
 * Scrolls the chat history to the top to ensure all historical messages
 * and artifacts are loaded into the DOM.
 * 
 * @param ctx UniversalContext
 * @param deps Dependencies
 */
/**
 * Robust history loading with support for limits and offsets.
 * Instead of scrolling to the absolute top, it can stop when enough messages are loaded.
 */
export async function scrollToTopAction(
    ctx: UniversalContext,
    deps: GeminiActionDeps,
    options: { limit?: number, untilText?: string } = {}
): Promise<void> {
    const { page, log } = ctx;
    const { limit, untilText } = options;
    
    log(`Initiating targeted history loading (limit: ${limit || 'max'}, until: ${untilText || 'none'})...`);

    const containerSelector = 'chat-window, .chat-history, [data-test-id="chat-history"], main div[style*="overflow-y: scroll"]';
    const container = page.locator(containerSelector).first();
    const messageSelector = deps.selectors.gemini.chat.response || '.model-response';
    
    let lastScrollHeight = 0;
    let stableCount = 0;
    const MAX_STABLE = 3; 
    const MAX_ITERATIONS = limit ? Math.ceil(limit / 5) + 5 : 50; 
    
    for (let i = 0; i < MAX_ITERATIONS; i++) {
        const messageCount = await page.locator(messageSelector).count();
        log(`Current message count in DOM: ${messageCount}`);

        // Check if we met the limit
        if (limit && messageCount >= limit) {
            log(`Reached requested limit of ${limit} messages.`);
            break;
        }

        // Check if we found the target text
        if (untilText) {
            const found = await page.locator(`:has-text("${untilText}")`).count() > 0;
            if (found) {
                log(`Found target text: "${untilText}". Stopping.`);
                break;
            }
        }

        const state = await container.evaluate(el => ({
            scrollHeight: el.scrollHeight,
            scrollTop: el.scrollTop
        })).catch(() => ({ scrollHeight: 0, scrollTop: 0 }));

        if (state.scrollHeight === lastScrollHeight && state.scrollTop === 0) {
            stableCount++;
            if (stableCount >= MAX_STABLE) break;
        } else {
            stableCount = 0;
            lastScrollHeight = state.scrollHeight;
        }

        await container.evaluate(el => el.scrollTo(0, 0));
        await page.waitForTimeout(1000); 

        // Efficient load-more detection
        const loadMoreSelectors = [
            'button:has-text("Load more")',
            'button:has-text("Načíst další")',
            'button[aria-label*="load more" i]'
        ];

        for (const sel of loadMoreSelectors) {
            const btn = page.locator(sel).first();
            if (await btn.isVisible().catch(() => false)) {
                await btn.click();
                await page.waitForTimeout(1500);
                break; 
            }
        }
    }

    log('Finished history loading.');
}
