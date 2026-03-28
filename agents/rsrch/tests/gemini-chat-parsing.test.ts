
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

    it('should extract rich structured data with 100% fidelity from a complex DOM', async () => {
        // The Golden HTML containing all supported edge cases
        const goldenHtml = `
            <model-response>
                <h1>High-Fidelity Test</h1>
                <p>This is a <strong>test</strong> of the extraction engine.</p>
                
                <h3>1. Lists and Links</h3>
                <ul>
                    <li>Point 1 with a <a href="https://example.com/regular">regular hyperlink</a>.</li>
                    <li>Point 2 with <code>inline code</code> block.</li>
                </ul>

                <h3>2. Tables (GFM)</h3>
                <table>
                    <thead>
                        <tr><th>Feature</th><th>Status</th><th>Notes</th></tr>
                    </thead>
                    <tbody>
                        <tr><td>LaTeX</td><td>Supported</td><td>MathJax</td></tr>
                        <tr><td>Tables</td><td>Improved</td><td>GFM format</td></tr>
                    </tbody>
                </table>

                <h3>3. Mathematics</h3>
                <p>Inline: <mjx-container tex="a^2 + b^2 = c^2" display="false"></mjx-container></p>
                <p>Display:</p>
                <mjx-container tex="E = mc^2" display="true"></mjx-container>

                <h3>4. Citations</h3>
                <p>Standard search link citation <a href="https://google.com/search?q=info">[1]</a>.</p>
                <p>Link with specific attribute <a data-attribution-url="https://nature.com/articles/s123" href="https://google.com/search?q=nature">Nature [2]</a>.</p>
                <p>Regular external link <a href="https://github.com">GitHub</a>.</p>
                
                <p>MathJax v3: <mjx-container tex="E=mc^2" display="true"></mjx-container></p>
                <p>KaTeX: <span class="math katex" data-tex="a^2 + b^2 = c^2">a^2 + b^2 = c^2</span></p>

                <h3>5. Visuals</h3>
                <svg width="100" height="100" aria-label="Simple Architecture">
                    <rect x="10" y="10" width="80" height="80" fill="blue" />
                </svg>
                <img src="https://example.com/generative-art.png" alt="Generative AI Art">

                <h3>6. Code Blocks</h3>
                <pre data-language="typescript"><code>
function hello() {
  console.log("Hello, World!");
}
                </code></pre>

                <p>End of test.</p>
            </model-response>
        `;

        // Set content and wait for it to be stable
        await page.setContent(`<!DOCTYPE html><html><head><style>model-response { display: block; padding: 20px; }</style></head><body>${goldenHtml}</body></html>`);
        await page.waitForSelector('model-response');

        const client = new GeminiClient(page as any);
        const data = await client.getLatestResponseData();

        expect(data).toBeDefined();
        if (!data) return;

        const md = data.markdown;

        // 1. Math Checks
        expect(md).toContain('$$\nE = mc^2\n$$');
        expect(md).toContain('$a^2 + b^2 = c^2$');

        // 2. Table Checks
        expect(md).toContain('| Feature | Status | Notes |');
        expect(md).toContain('| --- | --- | --- |');
        expect(md).toContain('| LaTeX | Supported | MathJax |');

        // 3. Link & Citation Checks
        expect(md).toContain('[regular hyperlink](https://example.com/regular)');
        expect(md).toContain('[^1]');
        expect(md).toContain('[^2]');
        expect(data.sources.length).toBe(2);
        expect(data.sources[1].url).toBe('https://nature.com/articles/s123'); // Nature [2]

        // 4. Code Block Checks
        expect(md).toContain('```typescript');
        expect(md).toContain('console.log("Hello, World!");');

        // 5. Asset Checks
        expect(md).toContain('> [!NOTE]');
        expect(md).toContain('Simple Architecture');
        expect(md).toContain('![Generative AI Art](https://example.com/generative-art.png)');
    });
});
