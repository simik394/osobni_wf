
import { UniversalContext } from '../types';

export interface WatchOptions {
    maxWaitMs?: number;
    pollIntervalMs?: number;
    sessionId?: string;
}

/**
 * Monitors a Gemini response until it stabilizes, then extracts high-fidelity data.
 * This is designed to run in a lightweight "Watcher" worker.
 */
export async function watchResponseAction(
    ctx: UniversalContext,
    options: WatchOptions = {},
    deps: {
        selectors: any;
        getLatestResponseData: () => Promise<{ text: string, markdown: string, sources: any[], thoughts?: string } | null>;
        getGraphStore: () => any;
        verbose: boolean;
    }
): Promise<{ success: boolean, markdown?: string }> {
    const { maxWaitMs = 120000, pollIntervalMs = 2000, sessionId } = options;
    const { page } = ctx;

    if (deps.verbose) console.log(`[Gemini] Watcher started for session: ${sessionId || 'current'}`);

    let elapsed = 0;
    let lastResponseLength = 0;
    let stableCount = 0;

    // 1. Polling Loop
    while (elapsed < maxWaitMs) {
        const latestResponse = page.locator(deps.selectors.gemini.chat.response).last();
        if (await latestResponse.count() > 0) {
            
            // Expand thought blocks if any
            if (deps.selectors.gemini.chat.thoughtToggle) {
                try {
                    const toggle = latestResponse.locator(deps.selectors.gemini.chat.thoughtToggle).first();
                    if (await toggle.isVisible({ timeout: 100 }).catch(() => false)) {
                        const expanded = await toggle.getAttribute('aria-expanded') === 'true';
                        if (!expanded) {
                            await toggle.click({ timeout: 500 }).catch(() => { });
                        }
                    }
                } catch (err) {}
            }

            const currentText = await latestResponse.innerText().catch(() => '');
            
            if (currentText.length > 0 && currentText.length === lastResponseLength) {
                stableCount++;
                if (stableCount >= 2) {
                    if (deps.verbose) console.log('[Gemini] Watcher: Response stabilized');
                    break;
                }
            } else {
                stableCount = 0;
                lastResponseLength = currentText.length;
            }
        }

        await page.waitForTimeout(pollIntervalMs);
        elapsed += pollIntervalMs;
    }

    // 2. High-Fidelity Extraction
    if (deps.verbose) console.log('[Gemini] Watcher: Triggering extraction...');
    const richData = await deps.getLatestResponseData();
    if (!richData) {
        return { success: false };
    }

    // 3. Finalize State in Graph
    if (sessionId) {
        const graphStore = deps.getGraphStore();
        if (graphStore && graphStore.getIsConnected()) {
            await graphStore.createOrUpdateGeminiSession({ 
                sessionId, 
                status: 'completed' 
            });
            await graphStore.addGeminiTurn({
                sessionId,
                role: 'assistant',
                content: richData.markdown,
                citations: richData.sources,
                thoughts: richData.thoughts
            });
        }
    }

    return { success: true, markdown: richData.markdown };
}
