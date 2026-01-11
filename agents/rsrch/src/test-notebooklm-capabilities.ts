import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { config } from './config';
import { NotebookLMClient } from './notebooklm-client';
import * as fs from 'fs';
import * as path from 'path';

chromium.use(StealthPlugin());

async function runTests() {
    console.log('[Test] Connecting to browser...');

    // Connect to existing browser or launch new one if needed
    // Assuming local headed run for testing or using the configured endpoint
    // Connect to browser service (Docker/Remote)
    // Priority: config.browserWsEndpoint (loaded from env/config)
    const wsEndpoint = config.browserWsEndpoint;
    const cdpEndpoint = config.browserCdpEndpoint;
    let browser;
    let context;

    if (wsEndpoint) {
        console.log(`[Test] Connecting to browser at ${wsEndpoint}...`);
        browser = await chromium.connect(wsEndpoint);
    } else if (cdpEndpoint) {
        console.log(`[Test] Connecting to browser via CDP at ${cdpEndpoint}...`);
        browser = await chromium.connectOverCDP({ endpointURL: cdpEndpoint });
    } else {
        throw new Error('BROWSER_WS_ENDPOINT or BROWSER_CDP_ENDPOINT not set. Dockerized browser required.');
    }

    // Reuse existing context if available (like client.ts does) logic or create new
    // For testing, we generally want a clean slate OR reuse auth.
    // client.ts reuses context if available. Let's try that to pick up the logged-in session!
    const contexts = browser.contexts();
    if (contexts.length > 0) {
        console.log(`[Test] Reusing existing browser context (${contexts.length} available)`);
        context = contexts[0];
    } else {
        console.log('[Test] Creating new context with auth file...');
        context = await browser.newContext({
            storageState: config.auth.authFile,
            viewport: { width: 1280, height: 1024 }
        });
    }

    let page;
    if (context.pages().length > 0) {
        console.log(`[Test] Reusing existing page (of ${context.pages().length})`);
        page = context.pages()[0];
    } else {
        console.log('[Test] Creating new page...');
        page = await context.newPage();
    }
    const client = new NotebookLMClient(page, { verbose: true });

    try {
        console.log('[Test] Cleaning up any stale state...');

        // Navigate to home first to dismiss any open dialogs/modals
        await page.goto('https://notebooklm.google.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });

        // Try to close any open dialogs by pressing Escape
        await page.keyboard.press('Escape');
        await page.waitForTimeout(500);
        await page.keyboard.press('Escape');
        await page.waitForTimeout(500);

        // Also try clicking outside any modal
        const backdrop = page.locator('.cdk-overlay-backdrop');
        if (await backdrop.count() > 0 && await backdrop.isVisible()) {
            console.log('[Test] Dismissing dialog backdrop...');
            await page.keyboard.press('Escape');
            await page.waitForTimeout(500);
        }

        console.log('[Test] Initializing NotebookLM Client...');
        await client.init();

        // --- Test 1: Web Content Update ---
        console.log('\n[Test 1] Starting Web Update Test...');
        // Note: Requires a public URL that changes. 
        // For this manual/automated hybrid, we will ask the user (or use a placeholder)
        // Testing limit: We can't easily spin up a public server here without ngrok.
        // We will assume a Gist URL is provided via ENV or use a constant one if available.
        const gistUrl = process.env.TEST_GIST_URL;

        if (gistUrl) {
            const notebookTitle = `Test Web Update ${Date.now()}`;
            await client.createNotebook(notebookTitle);
            await client.addSourceUrl(gistUrl);

            console.log('[Test 1] Source added. Querying baseline...');
            const baseline = await client.query("What is the content of the website source?");
            console.log(`[Test 1] Baseline: ${baseline}`);

            console.log('[Test 1] PAUSING. Please update the Gist content now.');
            console.log('[Test 1] Press Enter to continue...');
            await new Promise(resolve => process.stdin.once('data', resolve));

            // Implementation of "Update" check? 
            // NotebookLM doesn't auto-sync. We might need to look for a sync button or re-add.
            console.log('[Test 1] Attempting to re-add source to trigger update...');
            try {
                await client.addSourceUrl(gistUrl);
            } catch (e) {
                console.log('[Test 1] Re-add might have failed/warned (expected). Checking content...');
            }

            const updated = await client.query("What is the content of the website source now?");
            console.log(`[Test 1] Updated: ${updated}`);
        } else {
            console.log('[Test 1] SKIPPED (TEST_GIST_URL not set)');
        }

        // --- Test 2: PDF Image Reading ---
        console.log('\n[Test 2] Starting PDF Image Test...');
        const pdfPath = path.resolve(__dirname, '../data/test_image.pdf');

        // Ensure PDF exists (Helper to generate if missing)
        if (!fs.existsSync(pdfPath)) {
            console.log('[Test 2] Generating test PDF using existing page...');
            const originalUrl = page.url();

            // Navigate to about:blank to avoid TrustedHTML/CSP issues
            await page.goto('about:blank');

            await page.setContent(`
                <html>
                    <body>
                        <h1>Sales Report</h1>
                        <div style="background: red; width: 200px; height: 100px;">
                            <p style="color: white; font-weight: bold; font-size: 24px;">Sales: 500</p>
                        </div>
                    </body>
                </html>
            `);
            await page.pdf({ path: pdfPath, format: 'A4' });

            // Navigate back if we were somewhere else (though we init client after this usually)
            // But we already inited client? 
            // Actually client.init() was called before.
            // Client init navigates to home.
            // So we should navigate back to home.
            console.log('[Test 2] PDF generated. Navigating back...');
            await page.goto('https://notebooklm.google.com/');
        }

        const notebookTitlePdf = `Test PDF Images ${Date.now()}`;
        await client.createNotebook(notebookTitlePdf);

        // Upload PDF
        console.log(`[Test 2] Uploading ${pdfPath}...`);
        // We need to implement addSourceFile or similar in client, currently referenced as addSourceFromDrive
        // If file upload is not implemented in client, we might need to add it or skip.
        // Checking NotebookLMClient... it has addSourceText, addSourceUrl, addSourceFromDrive.
        // It DOES NOT seem to have local file upload implemented yet? 
        // Wait, 'selectors.ts' has 'dropZoneButton' which opens dialog. 
        // The dialog usually has "Upload" or similar.
        // Let's implement uploadSourceFile in client if missing, or use manual fallback.

        // For now, let's try to implement a basic file upload in this script or client.
        // Actually, let's check if we can implement it in the client first or here.
        // Adding it to client is cleaner.

        await client.uploadLocalFile(pdfPath); // Assuming we implement this!

        const pdfQuery = "What is the sales figure shown in the red box?";
        const pdfAnswer = await client.query(pdfQuery);
        console.log(`[Test 2] Answer: ${pdfAnswer}`);

    } catch (e) {
        console.error('[Test] Execution failed:', e);
        await client.dumpState('test_failure');
    } finally {
        // await context.close();
        // await browser.close();
        console.log('[Test] Done. Browser left open for inspection if headless=false');
    }
}

runTests();
