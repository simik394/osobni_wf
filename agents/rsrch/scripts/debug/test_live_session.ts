import { chromium } from 'playwright';
import { selectors } from '../../src/selectors';
import { GeminiClient } from '../../src/clients/gemini';
import { config } from '../../src/config';

/**
 * Script to test the extraction engine against a LIVE Gemini session.
 * 
 * Usage: npx ts-node scripts/debug/test_live_session.ts <session_id>
 */
async function main() {
    const sessionId = process.argv[2];
    if (!sessionId) {
        console.error('Usage: test_live_session.ts <session_id>');
        process.exit(1);
    }

    const browserWs = config.browser.wsEndpoint;
    console.log(`[LiveTest] Connecting to ${browserWs}...`);

    const browser = await chromium.connectOverCDP(browserWs);
    const context = browser.contexts()[0];
    if (!context) throw new Error('No browser context found.');

    const page = await context.newPage();
    const url = `${config.urls.gemini}/app/${sessionId}`;
    console.log(`[LiveTest] Navigating to ${url}...`);

    await page.goto(url, { waitUntil: 'networkidle' });
    
    // Wait for the response container to appear
    const responseSelector = selectors.gemini.chat.responseContainer;
    console.log(`[LiveTest] Waiting for ${responseSelector}...`);
    await page.waitForSelector(responseSelector, { timeout: 30000 });

    const client = new GeminiClient(page as any);
    const data = await client.getLatestResponseData();

    if (!data) {
        console.error('[LiveTest] Failed to extract data.');
        process.exit(1);
    }

    console.log('\n--- EXTRACTED MARKDOWN ---');
    console.log(data.markdown);
    console.log('\n--- SOURCES ---');
    console.table(data.sources);

    await browser.close();
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
