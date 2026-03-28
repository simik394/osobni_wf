import { chromium } from 'playwright';
import { selectors } from '../src/selectors';
import { config } from '../src/config';
import { watchResponseAction } from '../src/actions';
import { getRsrchTelemetry } from '@agents/shared';
import { getGraphStore } from '../src/core/graph-store';
import { UniversalContext } from '../src/actions/types';

/**
 * Windmill Script: Gemini Watcher
 * 
 * connects to a running session, waits for completion, and extracts high-fidelity data.
 */
export async function main(
    browser_ws_endpoint: string,
    session_id: string
) {
    if (!session_id) throw new Error('session_id is required for watcher');
    
    console.log(`[Windmill] Starting Gemini Watcher for Session: ${session_id}`);

    const telemetry = getRsrchTelemetry();
    let browser = null;
    
    try {
        // 1. Connect to Browser
        browser = await chromium.connectOverCDP(browser_ws_endpoint);

        const context = browser.contexts()[0];
        if (!context) throw new Error('No browser context found.');

        let page = context.pages().find(p => p.url().includes(`/app/${session_id}`));
        if (!page) {
            console.log(`[Windmill] Session ${session_id} not found in open tabs, navigating...`);
            page = await context.newPage();
            await page.goto(`${config.urls.gemini}/app/${session_id}`, { waitUntil: 'domcontentloaded' });
        }

        // 2. Prepare Context
        const ctx: UniversalContext = {
            page,
            log: (msg) => console.log(`[Watcher] ${msg}`),
            config
        };

        const deps = {
            selectors,
            getLatestResponseData: async () => {
                const { GeminiClient } = await import('../src/clients/gemini');
                const client = new GeminiClient(page, { verbose: true });
                return await client.getLatestResponseData();
            },
            getGraphStore: () => getGraphStore(),
            verbose: true
        };

        // 3. Watch
        const result = await watchResponseAction(ctx, { sessionId: session_id }, deps);

        return {
            success: result.success,
            session_id,
            status: result.success ? 'completed' : 'failed'
        };

    } catch (error: any) {
        console.error('[Windmill] Watcher failed:', error);
        return {
            success: false,
            error: error.message
        };
    } finally {
        if (browser) await browser.close();
    }
}
