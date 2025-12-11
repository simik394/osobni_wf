/**
 * Browser Integration Test via Docker CDP
 * 
 * Connects to the already-running authenticated Docker browser via CDP
 * to test rename functions on real services.
 * 
 * Run: npx ts-node tests/docker-browser-test.ts
 */

import { chromium } from 'playwright';

const CDP_URL = 'http://localhost:9223';

async function main() {
    console.log('='.repeat(60));
    console.log('DOCKER BROWSER INTEGRATION TEST');
    console.log('='.repeat(60));
    console.log(`\nConnecting to Docker browser at ${CDP_URL}...\n`);

    let browser;
    let context;

    try {
        // Connect to existing Docker browser via CDP
        browser = await chromium.connectOverCDP(CDP_URL, {
            timeout: 30000
        });

        console.log('✅ Connected to Docker browser');

        // Get the default context
        const contexts = browser.contexts();
        if (contexts.length === 0) {
            console.log('Creating new context...');
            context = await browser.newContext();
        } else {
            context = contexts[0];
            console.log(`Using existing context with ${context.pages().length} pages`);
        }

        // Create or get a page
        let page = context.pages()[0];
        if (!page) {
            page = await context.newPage();
        }

        // Test 1: Navigate to NotebookLM and check what we see
        console.log('\n--- Test 1: NotebookLM Access ---');
        await page.goto('https://notebooklm.google.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(3000);

        const currentUrl = page.url();
        console.log(`Current URL: ${currentUrl}`);

        // Check if we're logged in
        const isLoggedIn = !currentUrl.includes('accounts.google.com');
        console.log(`Logged in: ${isLoggedIn}`);

        if (isLoggedIn) {
            // Look for notebooks
            await page.waitForTimeout(2000);
            const notebooks = await page.locator('a[href*="/notebook/"]').count();
            console.log(`Found ${notebooks} notebook links`);

            // Take screenshot
            const screenshotPath = `data/notebooklm_test_${Date.now()}.png`;
            await page.screenshot({ path: screenshotPath, fullPage: true });
            console.log(`Screenshot saved: ${screenshotPath}`);
        } else {
            console.log('❌ Not logged in to Google. Need to authenticate first.');
        }

        // Test 2: Navigate to Google Docs
        console.log('\n--- Test 2: Google Docs Access ---');
        // Use a test document ID (you can change this)
        const testDocUrl = 'https://docs.google.com/document/u/0/';
        await page.goto(testDocUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(3000);

        const docsUrl = page.url();
        console.log(`Current URL: ${docsUrl}`);

        const docsLoggedIn = !docsUrl.includes('accounts.google.com');
        console.log(`Logged in: ${docsLoggedIn}`);

        if (docsLoggedIn) {
            // Look for recent documents
            const docs = await page.locator('[data-target="docs"]').count();
            console.log(`Found ${docs} recent doc elements`);

            // Take screenshot
            const screenshotPath = `data/gdocs_test_${Date.now()}.png`;
            await page.screenshot({ path: screenshotPath, fullPage: true });
            console.log(`Screenshot saved: ${screenshotPath}`);
        }

        console.log('\n' + '='.repeat(60));
        console.log('TEST COMPLETE');
        console.log('='.repeat(60));

    } catch (e: any) {
        console.error('❌ Test failed:', e.message);
        if (e.message.includes('connect')) {
            console.log('\nHint: Make sure the Docker container is running with CDP exposed:');
            console.log('  docker compose up -d');
        }
    } finally {
        // Don't close the browser - it's shared
        if (browser) {
            browser.close();
        }
    }
}

main().catch(console.error);
