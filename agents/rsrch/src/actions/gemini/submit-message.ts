
import { UniversalContext } from '../types';
import { SendMessageOptions } from './chat';

/**
 * Submits a message to Gemini and returns immediately.
 * Does NOT wait for a response.
 */
export async function submitMessageAction(
    ctx: UniversalContext,
    message: string,
    options: SendMessageOptions = {},
    deps: {
        checkAuth: () => Promise<void>;
        setModel: (model: string) => Promise<boolean>;
        uploadFiles: (files: string[]) => Promise<boolean>;
        injectSources: (sources: any[]) => Promise<void>;
        injectText: (text: string) => Promise<void>;
        resetToNewChat: () => Promise<void>;
        selectors: any;
        telemetry: any;
        verbose: boolean;
        getCurrentSessionId: () => string | null;
        getGraphStore: () => any;
    }
): Promise<{ sessionId: string | null; success: boolean }> {
    const { resetSession, files = [], sources = [], model } = options;
    const { page } = ctx;

    if (deps.verbose) console.log(`[Gemini] Submitting message: "${message.substring(0, 50)}..."`);

    // 1. Prerequisites
    await deps.checkAuth();
    if (model) await deps.setModel(model);
    if (files.length > 0) await deps.uploadFiles(files);
    if (sources.length > 0) await deps.injectSources(sources);
    if (resetSession) await deps.resetToNewChat();

    // 2. Action
    const input = page.locator(deps.selectors.gemini.chat.input).first();
    await input.waitFor({ state: 'visible', timeout: 10000 });
    
    if (message) {
        await deps.injectText(message);
    }
    await page.waitForTimeout(300);

    // 3. Click Send or Press Enter
    let sendClicked = false;
    const sendBtn = page.locator(deps.selectors.gemini.chat.send).first();
    if (await sendBtn.isVisible({ timeout: 500 }).catch(() => false)) {
        await sendBtn.click();
        sendClicked = true;
    }

    if (!sendClicked) {
        if (deps.verbose) console.log('[Gemini] Trigerring send via Enter key...');
        await input.press('Enter');
    }

    // 4. State Tracking (Registry & Graph)
    const sessionId = deps.getCurrentSessionId();
    if (sessionId) {
        const graphStore = deps.getGraphStore();
        if (graphStore && graphStore.getIsConnected()) {
            // Update session status to PENDING
            await graphStore.createOrUpdateGeminiSession({ 
                sessionId, 
                status: 'pending' 
            });
            // Record the user prompt turn immediately
            await graphStore.addGeminiTurn({ 
                sessionId, 
                role: 'user', 
                content: message 
            });
        }
    }

    return { sessionId, success: true };
}
