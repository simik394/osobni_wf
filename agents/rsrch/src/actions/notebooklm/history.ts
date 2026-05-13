import { UniversalContext, NotebookLMActionDeps } from '../types';

/**
 * Exports the full chat history of a NotebookLM notebook as high-fidelity Markdown.
 */
export async function exportNotebookHistoryAction(
    ctx: UniversalContext,
    deps: NotebookLMActionDeps
): Promise<{ title: string; markdown: string; turns: any[] }> {
    const { page, log } = ctx;
    const { selectors } = deps;

    log('Exporting full NotebookLM chat history...');

    const title = await page.locator('.notebook-title, .title-input-container input').first()
        .evaluate(el => {
            if (el instanceof HTMLInputElement) return el.value;
            return (el as HTMLElement).innerText;
        }).catch(() => 'Untitled Notebook');

    const turns: any[] = [];
    let markdown = `# Chat History: ${title}\n\n`;

    try {
        // NotebookLM uses .chat-message-pair to group user and AI messages
        const messagePairs = page.locator('.chat-message-pair');
        const count = await messagePairs.count();

        for (let i = 0; i < count; i++) {
            const pair = messagePairs.nth(i);

            // User Message
            const userMsg = pair.locator('.user-query-container .individual-message, .from-user-container').first();
            if (await userMsg.isVisible().catch(() => false)) {
                const content = await userMsg.innerText();
                markdown += `### User\n\n${content.trim()}\n\n`;
                turns.push({ role: 'user', content: content.trim() });
            }

            // AI Response (with reasoning/thoughts if present)
            const aiMsgContainer = pair.locator('.response-container, .to-user-container, .model-response-container').first();
            if (await aiMsgContainer.isVisible().catch(() => false)) {
                
                // Check for thinking process (reasoning)
                let thoughts: string | undefined;
                const toggleSelector = selectors.chat.thoughtToggle;
                if (toggleSelector) {
                    const thoughtToggle = aiMsgContainer.locator(toggleSelector).first();
                    if (await thoughtToggle.isVisible({ timeout: 100 }).catch(() => false)) {
                        // Try to expand it if not already
                        const thoughtContent = aiMsgContainer.locator('.thought-process-content, .reasoning-content').first();
                        if (!(await thoughtContent.isVisible().catch(() => false))) {
                            await thoughtToggle.click().catch(() => {});
                            await page.waitForTimeout(300);
                        }
                        thoughts = await thoughtContent.innerText().catch(() => undefined);
                    }
                }


                const aiContent = aiMsgContainer.locator('.individual-message, .message-content').first();
                const content = await aiContent.innerText().catch(() => '');

                markdown += `### Notebook AI\n\n`;
                if (thoughts) {
                    markdown += `> [!NOTE]\n> **Thinking Process**\n> ${thoughts.replace(/\n/g, '\n> ')}\n\n`;
                }
                markdown += `${content.trim()}\n\n`;
                turns.push({ role: 'ai', content: content.trim(), thoughts });
            }
        }
    } catch (e: any) {
        log(`Error during chat history export: ${e.message}`, 'error');
    }

    return { title, markdown: markdown.trim(), turns };
}
