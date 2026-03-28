
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { GeminiClient } from '../src/clients/gemini';
import * as fs from 'fs';
import * as path from 'path';

describe('Gemini Chat Parsing Fidelity', () => {
    let browser: Browser;
    let context: BrowserContext;
    let page: Page;

    beforeAll(async () => {
        browser = await chromium.launch({ headless: true });
        context = await browser.newContext();
        page = await context.newPage();
    });

    afterAll(async () => {
        await browser.close();
    });

    it('should achieve 100% fidelity on the Complex Session Golden Master', async () => {
        const fixturePath = path.join(__dirname, 'fixtures/gemini-complex-session.html');
        if (!fs.existsSync(fixturePath)) {
            throw new Error(`Fixture not found: ${fixturePath}`);
        }
        let complexHtml = fs.readFileSync(fixturePath, 'utf-8');
        
        // Wrap for Playwright
        await page.setContent(`<!DOCTYPE html><html><body>${complexHtml}</body></html>`);
        await page.waitForSelector('.model-response');

        const client = new GeminiClient(page as any);
        const data = await client.getLatestResponseData();

        expect(data).toBeDefined();
        if (!data) return;

        const md = data.markdown;

        // 1. Math Verification (Quadratic Formula)
        // Note: Heuristic extracts from mjx-assistive-mml if present, or mjx-math text
        expect(md).toContain('x');
        expect(md).toContain('=');
        expect(md).toContain('2a');

        // 2. Table Verification
        expect(md).toContain('| Metric | Value | Trend |');
        expect(md).toContain('| Revenue | $1.2M | Up 15% |');

        // 3. Citation Verification
        expect(md).toContain('[^1]');
        expect(md).toContain('[^2]');
        expect(data.sources.length).toBe(2);
        expect(data.sources[0].url).toBe('https://example.com/paper1');
        expect(data.sources[1].url).toBe('https://example.com/paper2');
        expect(data.sources[1].title).toContain('Nature'); // Property is 'title', not 'text'

        // 4. Code Block Verification
        expect(md).toContain('```');
        expect(md).toContain('function hello()');

        // 5. Nested List Verification
        expect(md).toContain('* Task A');
        expect(md).toContain('    * Subtask A1');
    });
});
