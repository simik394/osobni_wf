import { UniversalContext, NotebookLMActionDeps } from '../types';

/**
 * Sends a query to the current NotebookLM chat.
 * 
 * @param ctx UniversalContext
 * @param deps Dependencies including selectors
 * @param message The query message
 * @returns The AI response text
 */
export async function queryNotebookAction(
    ctx: UniversalContext,
    deps: NotebookLMActionDeps & { humanDelay: (ms: number) => Promise<void> },
    message: string
): Promise<string> {
    const { page, log } = ctx;
    const { selectors, humanDelay } = deps;

    log(`Sending query: "${message}"`);

    try {
        const inputSelector = selectors.chat.input;
        await page.waitForSelector(inputSelector, { state: 'visible', timeout: 60000 });

        // Wait for input to be enabled
        await page.waitForFunction(
            (sel: string) => {
                const el = document.querySelector(sel) as HTMLTextAreaElement | null;
                return el && !el.disabled;
            },
            inputSelector,
            { timeout: 60000 }
        );

        log('Chat input enabled. Filling query...');
        await page.fill(inputSelector, message);
        await humanDelay(800);

        const sendSelector = selectors.chat.submitButton;
        await page.click(sendSelector);

        // Wait for thinking indicator
        try {
            const indicator = selectors.chat.thinkingIndicator;
            await page.waitForSelector(indicator, { timeout: 5000 });
            await page.waitForSelector(indicator, { state: 'hidden', timeout: 60000 });
        } catch (e) {
            log('Thinking indicator flow timed out or skipped', 'warn');
        }

        await humanDelay(1000);

        const lastMsgSelector = selectors.chat.lastMessage;
        await page.waitForSelector(lastMsgSelector, { timeout: 10000 });
        const response = await page.textContent(lastMsgSelector);

        log(`Response received (${response?.length} chars)`);
        return response || '';
    } catch (e: any) {
        log(`Query failed: ${e.message}`, 'error');
        throw e;
    }
}

/**
 * Gets chat messages from the current notebook.
 */
export async function getChatMessagesAction(
    ctx: UniversalContext,
    deps: NotebookLMActionDeps
): Promise<Array<{ role: 'user' | 'ai'; contentPreview: string }>> {
    const { page, log } = ctx;
    const messages: Array<{ role: 'user' | 'ai'; contentPreview: string }> = [];

    try {
        log('Extracting chat messages...');

        const messagePairs = page.locator('.chat-message-pair');
        const pairCount = await messagePairs.count();

        if (pairCount === 0) {
            log('No chat message pairs found.');
            return messages;
        }

        log(`Found ${pairCount} message pairs`);

        for (let i = 0; i < pairCount; i++) {
            const pair = messagePairs.nth(i);

            const userMsg = pair.locator('.user-query-container .individual-message, .from-user-container');
            if (await userMsg.count() > 0) {
                const content = await userMsg.innerText().catch(() => '');
                if (content) messages.push({ role: 'user', contentPreview: content.trim() });
            }

            const aiMsg = pair.locator('.response-container .individual-message, .to-user-container, .model-response-container');
            if (await aiMsg.count() > 0) {
                const content = await aiMsg.innerText().catch(() => '');
                if (content) messages.push({ role: 'ai', contentPreview: content.trim() });
            }
        }
    } catch (e: any) {
        log(`Error extracting chat messages: ${e.message}`, 'error');
    }

    return messages;
}
