
import { Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

export class GeminiClient {
    private page: Page;

    constructor(page: Page) {
        this.page = page;
    }

    async init() {
        console.log('[Gemini] Initializing...');
        await this.page.goto('https://gemini.google.com/', { waitUntil: 'domcontentloaded' });

        // Handle "Welcome" or "Sign in" checks if needed
        // For now, we assume shared auth session works
        try {
            await this.page.waitForSelector('chat-app, .input-area, textarea', { timeout: 10000 });
            console.log('[Gemini] Ready.');
        } catch (e) {
            console.warn('[Gemini] Timeout waiting for chat interface. Check login.');
            await this.dumpState('gemini_init_fail');
        }
    }

    async research(query: string): Promise<string> {
        console.log(`[Gemini] Researching: "${query}"`);
        try {
            // 1. Locate Input Area
            const inputSelector = 'div[contenteditable="true"], textarea, input[type="text"]';
            const input = this.page.locator(inputSelector).first();

            await input.waitFor({ state: 'visible', timeout: 10000 });
            await input.fill(query);
            await this.page.waitForTimeout(500); // Debounce
            await input.press('Enter');

            // 2. Wait for Response
            console.log('[Gemini] Waiting for response...');

            // Wait for any response container
            // Gemini structures change, so use multiple potential selectors
            const responseSelector = 'model-response, .message-content, .response-container-content, .model-response-text';
            await this.page.waitForSelector(responseSelector, { timeout: 20000 });

            // Wait for generation to likely complete
            await this.page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => { });

            // 3. Extract Text
            const responses = this.page.locator(responseSelector);
            const count = await responses.count();
            if (count > 0) {
                const lastResponse = responses.last();
                const text = await lastResponse.innerText();
                console.log('[Gemini] Response extracted.');
                return text;
            } else {
                throw new Error('No response elements found after wait.');
            }
        } catch (e) {
            console.error('[Gemini] Research failed:', e);
            await this.dumpState('gemini_research_fail');
            throw e;
        }
    }

    async dumpState(name: string) {
        try {
            const dataDir = path.join(process.cwd(), 'data');
            if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

            const timestamp = Date.now();
            const cleanName = name.toLowerCase().replace(/[^a-z0-9]/g, '_');
            const htmlPath = path.join(dataDir, `${cleanName}_${timestamp}.html`);
            const pngPath = path.join(dataDir, `${cleanName}_${timestamp}.png`);

            const html = await this.page.evaluate(() => document.body.outerHTML);
            fs.writeFileSync(htmlPath, html);
            await this.page.screenshot({ path: pngPath, fullPage: true });
            console.log(`[Gemini] Dumped state to ${htmlPath} / ${pngPath}`);
        } catch (e) {
            console.error('[Gemini] Failed to dump state:', e);
        }
    }
}
