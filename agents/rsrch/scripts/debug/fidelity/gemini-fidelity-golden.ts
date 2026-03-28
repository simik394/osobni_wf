
import { chromium } from 'playwright';
import { GeminiClient } from '../src/clients/gemini';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
    console.log('='.repeat(60));
    console.log('GEMINI FIDELITY GOLDEN MASTER TEST');
    console.log('='.repeat(60));

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

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
            <p>As shown in the recent study <a data-attribution-url="https://nature.com/articles/s123" href="https://google.com/search?q=nature+study">Nature [1]</a>.</p>
            <p>Another reference <a data-attribution-url="https://arxiv.org/abs/2401.0001" href="https://google.com/search?q=arxiv+2401">arXiv [2]</a>.</p>

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

    console.log('\n[1] Extracting data via GeminiClient...');
    const client = new GeminiClient(page as any);
    const data = await client.getLatestResponseData();

    if (!data) {
        console.error('❌ Failed to extract data');
        process.exit(1);
    }

    const md = data.markdown;
    console.log('\n[2] Verifying Extraction Results:');

    const checks = [
        { label: 'LaTeX Display ($$)', pass: md.includes('$$\nE = mc^2\n$$') },
        { label: 'LaTeX Inline ($)', pass: md.includes('$a^2 + b^2 = c^2$') },
        { label: 'GFM Tables', pass: md.includes('| Feature | Status | Notes |') && md.includes('| --- | --- | --- |') },
        { label: 'Hyperlinks', pass: md.includes('[regular hyperlink](https://example.com/regular)') },
        { label: 'Citation Markers', pass: md.includes('[^1]') && md.includes('[^2]') },
        { label: 'Citation Sources', pass: data.sources.length === 2 && data.sources[0].url === 'https://nature.com/articles/s123' },
        { label: 'Diagram Notation', pass: md.includes('> [!NOTE]') && md.includes('Simple Architecture') },
        { label: 'Image Preservation', pass: md.includes('![Generative AI Art](https://example.com/generative-art.png)') },
        { label: 'Code Blocks', pass: md.includes('```typescript') && md.includes('console.log') }
    ];

    let allPassed = true;
    checks.forEach(c => {
        console.log(`  ${c.pass ? '✅' : '❌'} ${c.label}`);
        if (!c.pass) allPassed = false;
    });

    if (allPassed) {
        console.log('\n🚀 ALL FIDELITY CHECKS PASSED!');
        
        // Save for reference
        const reportPath = path.join(process.cwd(), 'data/experiments/golden_fidelity_report.md');
        if (!fs.existsSync(path.dirname(reportPath))) fs.mkdirSync(path.dirname(reportPath), { recursive: true });
        
        const report = `# Golden Fidelity Report\n\nGenerated: ${new Date().toISOString()}\n\n## Markdown Output\n\n\`\`\`markdown\n${md}\n\`\`\`\n\n## Sources\n\n${JSON.stringify(data.sources, null, 2)}\n`;
        fs.writeFileSync(reportPath, report);
        console.log(`\nReport saved to: ${reportPath}`);
    } else {
        console.error('\n❌ FIDELITY CHECKS FAILED');
        console.log('\nActual Markdown Output:\n');
        console.log('-'.repeat(40));
        console.log(md);
        console.log('-'.repeat(40));
        process.exit(1);
    }

    await browser.close();
}

main().catch(e => {
    console.error('Test Execution Error:', e);
    process.exit(1);
});
