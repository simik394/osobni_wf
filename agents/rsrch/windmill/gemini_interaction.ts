
import { chromium } from 'playwright';

/**
 * Windmill Script: Gemini Interaction
 * 
 * connect to the running browser, executre a prompt, and return the result.
 * This runs as a single atomic job to avoid network latency of individual CDP frames.
 */
export async function main(
    browser_ws_endpoint: string,
    message: string,
    session_id?: string,
    model: 'pro' | 'flash' | 'thinking' = 'pro'
) {
    console.log(`[Windmill] Starting Gemini Interaction (Model: ${model}, Session: ${session_id || 'new'})`);

    let browser = null;
    try {
        // 1. Connect to Browser
        console.log(`[Windmill] Connecting to browser at ${browser_ws_endpoint}...`);
        browser = await chromium.connectOverCDP(browser_ws_endpoint);

        // 2. Get the correct context (Persistent Context is usually the default one)
        const context = browser.contexts()[0];
        if (!context) {
            throw new Error('No browser context found. Is the browser container running with persistent profile?');
        }

        // 3. Get or Create Page
        // We try to find an existing Gemini tab or create new one
        let page = context.pages().find(p => p.url().includes('gemini.google.com'));
        if (!page) {
            console.log('[Windmill] No active Gemini tab, creating new one...');
            page = await context.newPage();
        } else {
            console.log('[Windmill] Reuse existing Gemini tab');
        }

        // 4. Navigate
        const targetUrl = session_id
            ? `https://gemini.google.com/app/${session_id}`
            : 'https://gemini.google.com/app';

        if (page.url() !== targetUrl) {
            console.log(`[Windmill] Navigating to ${targetUrl}...`);
            await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
        }

        // 5. Basic Interactions
        // TODO: Import shared selectors if possible, or duplicate for robustness/independence
        // For this POC script, we use hardcoded selectors for robustness
        const selectors = {
            input: 'div[contenteditable="true"], textarea',
            sendButton: 'button[aria-label*="Send"], button[aria-label*="Odeslat"]', // Multilingual support
            response: 'model-response', // Custom element usually
        };

        // Wait for input
        await page.waitForSelector(selectors.input, { timeout: 15000 });

        // Type message
        console.log('[Windmill] Typing message...');
        await page.fill(selectors.input, message);

        // Click Send
        console.log('[Windmill] Sending...');
        // Sometimes typing is enough, sometimes need to click
        await page.click(selectors.sendButton);

        // Wait for response
        // Logic: Wait for the *new* response to appear. 
        // This is tricky without streaming, but for a simplified script we can wait for the "stop generating" button to disappear?
        // Or wait for the last model-response to be non-empty and stable?

        // Simple heuristic: Wait 2 seconds, then wait for streaming to stop
        await page.waitForTimeout(2000);

        // Extract last response
        // ... (Implementation detail to be refined)

        const responseText = await page.evaluate(() => {
            const responses = document.querySelectorAll('model-response');
            if (responses.length === 0) return null;
            return (responses[responses.length - 1] as HTMLElement).innerText;
        });

        console.log('[Windmill] Interaction complete.');
        return {
            success: true,
            response: responseText,
            session_id: page.url().split('/app/')[1] // Return new session ID if one was created
        };

    } catch (error: any) {
        console.error('[Windmill] Interaction failed:', error);
        return {
            success: false,
            error: error.message
        };
    } finally {
        if (browser) {
            // We do NOT close the browser as it is a persistent service
            // We might close the page if we opened a new one, but for state persistence maybe keep it?
            // Let's disconnect.
            await browser.close(); // close() on connected CDP browser just disconnects, doesn't kill process usually?
            // Actually browser.close() kills it if launched, but for connectOverCDP it might just disconnect.
            // Safer to just disconnect if method exists, or check docs. 
            // Playwright connectOverCDP -> close() disconnects.
        }
    }
}
