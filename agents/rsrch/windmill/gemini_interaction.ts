import { chromium, Page } from 'playwright';
import { selectors } from '../src/selectors';
import { config } from '../src/config';
import { sendMessageAction, submitMessageAction } from '../src/actions';
import { setModelAction, resetToNewChatAction } from '../src/actions';
import { getRsrchTelemetry } from '@agents/shared';
import { getGraphStore } from '../src/core/graph-store';
import { UniversalContext } from '../src/actions/types';

/**
 * Windmill Script: Gemini Interaction
 * 
 * connect to the running browser, execute a prompt, and return the result.
 */
export async function main(
    browser_ws_endpoint: string,
    message: string,
    session_id?: string,
    model: 'pro' | 'flash' | 'thinking' = 'pro',
    waitForResponse: boolean = true
) {
    console.log(`[Windmill] Starting Gemini Interaction (Model: ${model}, Session: ${session_id || 'new'}, wait: ${waitForResponse})`);

    const telemetry = getRsrchTelemetry();
    let browser = null;
    
    try {
        // 1. Connect to Browser
        console.log(`[Windmill] Connecting to browser at ${browser_ws_endpoint}...`);
        browser = await chromium.connectOverCDP(browser_ws_endpoint);

        const context = browser.contexts()[0];
        if (!context) throw new Error('No browser context found.');

        let page = context.pages().find(p => p.url().includes('gemini.google.com'));
        if (!page) {
            console.log('[Windmill] No active Gemini tab, creating new one...');
            page = await context.newPage();
        }

        // 2. Prepare Workflow context/deps
        const ctx: UniversalContext = {
            page,
            log: (msg) => console.log(`[Gemini] ${msg}`),
            config
        };

        const deps = {
            checkAuth: async () => { /* Assume pre-authenticated */ },
            setModel: async (m: string) => setModelAction(ctx, { selectors }, m),
            uploadFiles: async (f: string[]) => { console.log('File upload not implemented'); return false; },
            injectSources: async () => { },
            injectText: async (text: string) => {
                const input = page.locator(selectors.gemini.chat.input).first();
                await input.fill(text);
            },
            resetToNewChat: async () => resetToNewChatAction(ctx, { selectors }),
            selectors,
            telemetry,
            verbose: true,
            getLatestResponse: async () => {
                const latest = page.locator(selectors.gemini.chat.response).last();
                return await latest.innerText().catch(() => null);
            },
            getLatestResponseData: async () => {
                const { GeminiClient } = await import('../src/clients/gemini');
                const client = new GeminiClient(page, { verbose: true });
                return await client.getLatestResponseData();
            },
            getCurrentSessionId: () => {
                const url = page.url();
                const parts = url.split('/app/');
                return parts.length > 1 ? parts[1].split('?')[0] : null;
            },
            getGraphStore: () => getGraphStore(),
            dumpState: async (prefix: string) => { console.log(`[Dump] ${prefix}`); }
        };

        // 3. Navigation
        const targetUrl = session_id
            ? `${config.urls.gemini}/app/${session_id}`
            : `${config.urls.gemini}/app`;

        if (!page.url().includes(`/app/${session_id || ''}`)) {
            console.log(`[Windmill] Navigating to ${targetUrl}...`);
            await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
        }

        // 4. Set Model if needed
        if (model !== 'pro') {
            await deps.setModel(model);
        }

        // 5. Interaction
        if (!waitForResponse) {
            const { sessionId } = await submitMessageAction(ctx, message, {}, deps);
            return { success: true, session_id: sessionId, status: 'pending' };
        }

        const finalResponse = await sendMessageAction(ctx, message, { waitForResponse: true }, deps);

        return {
            success: true,
            response: finalResponse,
            session_id: deps.getCurrentSessionId()
        };

    } catch (error: any) {
        console.error('[Windmill] Interaction failed:', error);
        return {
            success: false,
            error: error.message
        };
    } finally {
        if (browser) await browser.close();
    }
}
