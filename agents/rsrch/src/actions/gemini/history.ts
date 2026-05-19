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

/**
 * Exports the full current session history as high-fidelity Markdown.
 */
export async function exportFullSessionAction(
    ctx: UniversalContext,
    deps: GeminiActionDeps & { extractResponse: typeof import('./extract-response').extractResponseAction }
): Promise<{ title: string; markdown: string; turns: any[] }> {
    const { page, log } = ctx;
    const { selectors } = deps;

    log('Exporting full session history...');

    // 1. Ensure all history is loaded
    await scrollToTopAction(ctx, deps, { limit: 100 });

    const title = await page.title().then(t => t.replace('Gemini - ', '').trim());
    
    // 2. Identify all turns (User prompts and Model responses)
    // We use a broader set of selectors to catch the turn containers
    const turnSelector = 'user-query, model-response, .user-message, .model-response, [data-test-id="chat-turn"]';
    const turns = page.locator(turnSelector);
    const count = await turns.count();
    log(`[Export] Found ${count} turns with selector: ${turnSelector}`);
    
    const turnData: any[] = [];
    let markdown = `# ${title}\n\n`;

    for (let i = 0; i < count; i++) {
        const turn = turns.nth(i);
        const tag = await turn.evaluate(el => el.tagName.toLowerCase()).catch(() => 'unknown');
        const cls = await turn.evaluate(el => el.className).catch(() => '');
        log(`[Export] Turn ${i}: tag=${tag}, class=${cls}`);
        const isAssistant = await turn.evaluate(el => 
            el.tagName.toLowerCase() === 'model-response' || 
            el.classList.contains('model-response') ||
            !!el.querySelector('model-response')
        );

        if (isAssistant) {
            // Use high-fidelity extraction for model responses
            const data = await deps.extractResponse(ctx, { selectors, verbose: true }, turnSelector, i);
            if (data) {
                markdown += `### Gemini\n\n`;
                if (data.thoughts) {
                    markdown += `> [!NOTE]\n> **Thinking Process**\n> ${data.thoughts.replace(/\n/g, '\n> ')}\n\n`;
                }
                markdown += `${data.markdown}\n\n`;
                turnData.push({ role: 'assistant', ...data });
            }
        } else {
            // User prompt
            const text = await turn.innerText();
            markdown += `### User\n\n${text.trim()}\n\n`;
            turnData.push({ role: 'user', text: text.trim() });
        }
    }

    return { title, markdown: markdown.trim(), turns: turnData };
}
