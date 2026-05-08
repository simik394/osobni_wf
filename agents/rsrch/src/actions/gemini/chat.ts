import { UniversalContext, GeminiActionDeps } from '../types';

export interface Source {
    type: 'text' | 'file' | 'url';
    content: string; // text content, file path, or URL
    filename?: string;
}

export interface SendMessageOptions {
    waitForResponse?: boolean;
    resetSession?: boolean;
    onProgress?: (text: string) => void;
    files?: string[];
    sources?: Source[];
    model?: string;
    gem?: string;
}

/**
 * Sends a message to Gemini and waits for a response.
 * Uses dependency injection to avoid circular imports with GeminiClient.
 */
export async function sendMessageAction(
    ctx: UniversalContext,
    message: string,
    options: SendMessageOptions = {},
    deps: {
        checkAuth: () => Promise<boolean>;
        setModel: (model: string) => Promise<boolean>;
        uploadFiles: (files: string[]) => Promise<boolean>;
        injectSources: (sources: Source[]) => Promise<void>;
        injectText: (text: string) => Promise<void>;
        resetToNewChat: () => Promise<void>;
        selectors: any;
        telemetry: any;
        verbose: boolean;
        getLatestResponse: () => Promise<string | null>;
        getLatestResponseData?: () => Promise<{ text: string, markdown: string, sources: any[], thoughts?: string } | null>;
        getCurrentSessionId: () => string | null;
        getGraphStore: () => any;
        dumpState: (prefix: string) => Promise<any>;
        selectGem?: (name: string) => Promise<boolean>;
    }
): Promise<string | null> {
    const { waitForResponse = true, resetSession, onProgress, files = [], sources = [], model, gem } = options;
    const { page, log } = ctx;

    log(`Sending message: "${message.substring(0, 50)}${message.length > 50 ? '...' : ''}" (Reset: ${resetSession})`);

    // Ensure we are logged in
    await deps.checkAuth();

    // Set model if requested
    if (model) {
        await deps.setModel(model);
    }

    // Select Gem if requested
    if (gem) {
        if (deps.selectGem) {
            await deps.selectGem(gem);
        } else {
            log('selectGem not available in deps', 'warn');
        }
    }

    // Upload files if any
    if (files.length > 0) {
        await deps.uploadFiles(files);
    }

    // Inject sources if any
    if (sources.length > 0) {
        await deps.injectSources(sources);
    }

    // Reset session for isolation if requested
    if (resetSession) {
        await deps.resetToNewChat();
    }

    // Start telemetry trace
    const trace = deps.telemetry.startTrace('gemini:send-message', {
        messageLength: message.length,
        waitForResponse
    });

    // Start generation tracking
    const generation = deps.telemetry.startGeneration(trace, message, 'gemini-2.0-flash');

    try {
        const input = page.locator(deps.selectors.gemini.chat.input).first();
        await input.waitFor({ state: 'visible', timeout: 10000 });

        const responsesBefore = await page.locator(deps.selectors.gemini.chat.response).count();

        if (message) {
            await deps.injectText(message);
        }

        await page.waitForTimeout(300);

        // Click Send button
        let sendClicked = false;
        const sendBtn = page.locator(deps.selectors.gemini.chat.send).first();
        if (await sendBtn.isVisible().catch(() => false)) {
            await sendBtn.click();
            sendClicked = true;
        }

        if (!sendClicked) {
            log('No Send button found, trying Enter key...', 'warn');
            await input.press('Enter');
        }

        if (!waitForResponse) {
            deps.telemetry.endGeneration(generation, 'No response awaited');
            deps.telemetry.endTrace(trace, 'Fire and forget', true);
            return null;
        }

        log(`Waiting for response... (Before count: ${responsesBefore})`);
        const maxWait = 90000;
        const pollInterval = 1000;
        let elapsed = 0;
        let lastResponseLength = 0;
        let stableCount = 0;

        while (elapsed < maxWait) {
            const responsesNow = await page.locator(deps.selectors.gemini.chat.response).count();
            if (responsesNow > responsesBefore) {
                const latestResponse = page.locator(deps.selectors.gemini.chat.response).last();

                // Handle common Gemini reasoning/thought blocks
                if (deps.selectors.gemini.chat.thoughtToggle) {
                    try {
                        const toggle = latestResponse.locator(deps.selectors.gemini.chat.thoughtToggle).first();
                        if (await toggle.isVisible({ timeout: 100 }).catch(() => false)) {
                            const expanded = await toggle.getAttribute('aria-expanded') === 'true';
                            if (!expanded) {
                                if (deps.verbose) log('Expanding thought/reasoning block...');
                                await toggle.click({ timeout: 500 }).catch(() => { });
                                await page.waitForTimeout(200);
                            }
                        }
                    } catch (err) {
                        // ignore error
                    }
                }

                let currentText = await latestResponse.innerText().catch(() => '');
                if (deps.verbose) log(`Response text length: ${currentText.length}, stableCount: ${stableCount}`);

                if (onProgress && currentText.length > lastResponseLength) {
                    onProgress(currentText);
                }

                if (currentText.length > 0 && currentText.length === lastResponseLength) {
                    stableCount++;
                    if (stableCount >= 2) {
                        if (deps.verbose) log('Response stabilized');
                        break;
                    }
                } else {
                    stableCount = 0;
                    lastResponseLength = currentText.length;
                }
            }
            await page.waitForTimeout(pollInterval);
            elapsed += pollInterval;
        }

        const richData = deps.getLatestResponseData ? await deps.getLatestResponseData() : null;
        const response = richData ? richData.markdown : await deps.getLatestResponse();
        
        log(`Response received (${response?.length || 0} chars)`);

        // Track in GraphStore
        const sessionId = deps.getCurrentSessionId();
        if (sessionId) {
            const graphStore = deps.getGraphStore();
            if (graphStore && graphStore.getIsConnected()) {
                const sessionTitle = await page.title().then(t => t.replace('Gemini - ', '').trim()).catch(() => message.substring(0, 50));
                await graphStore.createOrUpdateGeminiSession({ sessionId, title: sessionTitle });
                
                // Store turns with rich data support
                if (richData) {
                    // Record User turn
                    await graphStore.addGeminiTurn({ 
                        sessionId, 
                        role: 'user', 
                        content: message 
                    });
                    // Record Assistant turn with citations and thoughts
                    await graphStore.addGeminiTurn({
                        sessionId,
                        role: 'assistant',
                        content: richData.markdown,
                        citations: richData.sources,
                        thoughts: richData.thoughts
                    });
                } else {
                    // Fallback to old behavior
                    await graphStore.addGeminiQuery({ sessionId, query: message });
                }
            }
        }

        deps.telemetry.endGeneration(generation, response || '');
        deps.telemetry.addScore(trace, 'response_length', response?.length || 0);
        deps.telemetry.endTrace(trace, response?.substring(0, 200), true);

        return response;

    } catch (e: any) {
        log(`Failed to send message: ${e.message}`, 'error');
        await deps.dumpState('send_message_fail');

        deps.telemetry.trackError(trace, e as Error);
        deps.telemetry.endGeneration(generation, '');
        deps.telemetry.endTrace(trace, undefined, false);

        return null;
    }
}

/**
 * Submits feedback (like/dislike) for the last Gemini response.
 * 
 * @param ctx UniversalContext
 * @param deps Dependencies
 * @param isGood True for like, false for dislike
 * @param comment Optional feedback text
 */
export async function submitFeedbackAction(
    ctx: UniversalContext,
    deps: GeminiActionDeps,
    isGood: boolean,
    comment?: string
): Promise<boolean> {
    const { page, log } = ctx;
    const { selectors } = deps;

    try {
        const lastResponse = page.locator(selectors.gemini.chat.response).last();
        if (!await lastResponse.isVisible()) {
            log('No response found to provide feedback on', 'error');
            return false;
        }

        const btnSelector = isGood ? selectors.gemini.chat.like : selectors.gemini.chat.dislike;
        const btn = lastResponse.locator(btnSelector).first();
        
        if (await btn.isVisible()) {
            await btn.click();
            await page.waitForTimeout(500);

            if (comment) {
                // If a feedback dialog appears, try to fill it
                const feedbackInput = page.locator('textarea[aria-label*="feedback" i], mat-dialog-container textarea').first();
                if (await feedbackInput.isVisible({ timeout: 1000 }).catch(() => false)) {
                    await feedbackInput.fill(comment);
                    const submitBtn = page.locator('button:has-text("Submit"), button:has-text("Odeslat")').first();
                    await submitBtn.click();
                    await page.waitForTimeout(500);
                }
            }

            log(`Feedback (${isGood ? 'Good' : 'Bad'}) submitted.`);
            return true;
        }

        log('Feedback button not found', 'error');
        return false;
    } catch (e: any) {
        log(`Feedback failed: ${e.message}`, 'error');
        return false;
    }
}

/**
 * Edits the last user prompt and re-submits it.
 * 
 * @param ctx UniversalContext
 * @param deps Dependencies
 * @param newText New prompt content
 */
export async function editLastPromptAction(
    ctx: UniversalContext,
    deps: GeminiActionDeps,
    newText: string
): Promise<boolean> {
    const { page, log } = ctx;
    const { selectors } = deps;

    try {
        // User messages usually have an "Edit" button visible on hover
        const userMessages = page.locator('.user-query-container, .user-query');
        const lastUserMsg = userMessages.last();
        
        if (!await lastUserMsg.isVisible()) {
            log('No user message found to edit', 'error');
            return false;
        }

        await lastUserMsg.hover();
        const editBtn = lastUserMsg.locator(selectors.gemini.chat.editPrompt).first();
        
        if (await editBtn.isVisible()) {
            await editBtn.click();
            await page.waitForTimeout(500);

            const editor = page.locator('textarea, [contenteditable="true"]').first();
            if (await editor.isVisible()) {
                await editor.fill(newText);
                await page.keyboard.press('Enter');
                await page.waitForTimeout(1000);
                log('Prompt edited and re-submitted.');
                return true;
            }
        }

        log('Edit prompt UI sequence failed', 'error');
        return false;
    } catch (e: any) {
        log(`Edit prompt failed: ${e.message}`, 'error');
        return false;
    }
}
