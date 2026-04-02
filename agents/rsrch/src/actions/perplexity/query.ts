import { UniversalContext, PerplexityActionDeps } from '../types';

/**
 * Runs a query on Perplexity and extracts the answer.
 */
export async function perplexityQueryAction(
    ctx: UniversalContext,
    deps: PerplexityActionDeps,
    queryText: string
): Promise<{ query: string; answer: string | null; url: string }> {
    const { page, log, config } = ctx;
    const { selectors } = deps;

    log(`Running Perplexity query: "${queryText}"`);

    const currentUrl = page.url();
    if (!currentUrl.includes('perplexity.ai')) {
        await page.goto(config.urls.perplexity || 'https://www.perplexity.ai', { waitUntil: 'domcontentloaded' });
    }

    const qSelectors = Array.isArray(selectors.perplexity.queryInput)
        ? selectors.perplexity.queryInput
        : [selectors.perplexity.queryInput];

    let inputSelector = '';
    for (const selector of qSelectors) {
        try {
            await page.waitForSelector(selector, { timeout: 3000 });
            inputSelector = selector;
            break;
        } catch (e) { }
    }

    if (!inputSelector) throw new Error('Could not find Perplexity query input');

    await page.fill(inputSelector, queryText);
    await page.keyboard.press('Enter');

    log('Query submitted, waiting for answer...');
    await page.waitForSelector(selectors.perplexity.answerContainer, { timeout: 30000 });

    // Completion detection (Wait for "Stop generating" to disappear)
    try {
        await page.waitForSelector('button:has-text("Stop generating")', { state: 'detached', timeout: 60000 });
    } catch (e) {
        log('Generation completion check timed out, extracting current state', 'warn');
    }

    const answer = await page.textContent(selectors.perplexity.answerContainer);

    return {
        query: queryText,
        answer: answer ? answer.trim() : null,
        url: page.url()
    };
}
