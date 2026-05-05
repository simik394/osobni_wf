import { GeminiActionDeps, UniversalContext } from '../types';
import { extractResponseAction } from './extract-response';

export async function scrapeConversationsAction(
    ctx: UniversalContext, 
    deps: GeminiActionDeps, 
    limit: number = 10, 
    offset: number = 0, 
    progressCb?: (data: any) => void
): Promise<any[]> {
    const { page } = ctx;
    const { selectors } = deps;
    
    ctx.log(`Scraping ${limit} conversations (offset: ${offset})...`);
    
    // 1. Ensure sidebar is open
    const menuBtn = page.locator(selectors.gemini.sidebar.menu).first();
    if (await menuBtn.isVisible()) {
        const isExpanded = await menuBtn.getAttribute('aria-expanded') === 'true';
        if (!isExpanded) {
            await menuBtn.click();
            await page.waitForTimeout(500);
        }
    }

    // 2. Get conversation elements
    const convItems = page.locator(selectors.gemini.sidebar.conversations);
    const totalFound = await convItems.count();
    ctx.log(`Found ${totalFound} conversations in sidebar.`);

    const results: any[] = [];
    const end = Math.min(offset + limit, totalFound);

    for (let i = offset; i < end; i++) {
        const item = convItems.nth(i);
        const title = await item.innerText();
        const href = await item.getAttribute('href');
        const id = href?.split('/').pop() || `index_${i}`;

        if (progressCb) {
            progressCb({
                type: 'progress',
                current: i - offset + 1,
                total: end - offset,
                title,
                message: `Scraping: ${title}`
            });
        }

        // Navigate
        await item.click();
        await page.waitForTimeout(1000); // Wait for load

        // Extract
        const conversation = await extractCurrentConversationAction(ctx, deps);
        if (conversation) {
            conversation.platformId = id;
            results.push(conversation);
        }
    }

    return results;
}

export async function extractCurrentConversationAction(ctx: UniversalContext, deps: GeminiActionDeps): Promise<any> {
    const { page } = ctx;
    const { selectors } = deps;
    
    ctx.log(`Extracting current conversation...`);
    
    // Wait for messages to be visible
    await page.waitForSelector(selectors.gemini.chat.response, { timeout: 5000 }).catch(() => {});

    const title = await page.title().then(t => t.replace('Gemini - ', '').trim());
    
    // Extract turns (User and Assistant)
    // We need a selector for user messages too. 
    // Usually user messages are in siblings or identifiable by class.
    const turns = await page.evaluate((sel) => {
        // This is a heuristic: user messages often don't have the .model-response class
        // but are in the same stream.
        const containers = Array.from(document.querySelectorAll('user-query, model-response, .user-message, .model-response'));
        
        return containers.map(container => {
            const isAssistant = container.tagName.toLowerCase() === 'model-response' || container.classList.contains('model-response');
            return {
                role: isAssistant ? 'assistant' : 'user',
                content: (container as HTMLElement).innerText.trim(),
                timestamp: Date.now() // Gemini doesn't always show precise per-message timestamps in DOM
            };
        });
    }, selectors.gemini);

    // Filter out empty turns
    const validTurns = turns.filter(t => t.content.length > 0);

    return {
        title,
        platform: 'gemini',
        type: 'regular', // default
        turns: validTurns,
        capturedAt: Date.now()
    };
}
