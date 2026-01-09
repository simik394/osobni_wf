import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { config } from './config';
import * as fs from 'fs';
import * as path from 'path';

// Add stealth plugin
chromium.use(StealthPlugin());

export async function runQuery(queryText: string) {
    console.log(`Running query: "${queryText}"`);

    if (!fs.existsSync(config.auth.authFile)) {
        console.error(`Auth file not found at ${config.auth.authFile}. Please run "npm run auth" first to log in.`);
        return;
    }

    let browser;
    if (config.browserWsEndpoint) {
        console.log(`Connecting to browser service at ${config.browserWsEndpoint}...`);
        browser = await chromium.connect(config.browserWsEndpoint);
    } else {
        console.log('Launching local browser (System Chrome)...');
        browser = await chromium.launch({ headless: false, channel: 'chrome' });
    }

    console.log('Creating context with saved auth state...');
    const context = await browser.newContext({
        storageState: config.auth.authFile
    });

    const page = await context.newPage();

    try {
        await page.goto(config.url);
        // await page.waitForLoadState('networkidle'); // Too slow

        // Wait for input - faster check
        console.log('Looking for query input...');

        const selectors = Array.isArray(config.selectors.queryInput)
            ? config.selectors.queryInput
            : [config.selectors.queryInput];

        let inputSelector = '';
        for (const selector of selectors) {
            try {
                // Reduced timeout for faster failover
                await page.waitForSelector(selector, { timeout: 2000 });
                inputSelector = selector;
                console.log(`Found input with selector: ${selector}`);
                break;
            } catch (e) {
                // Continue to next selector
            }
        }

        if (!inputSelector) {
            throw new Error('Could not find query input field with any known selector.');
        }

        console.log('Typing query...');
        await page.fill(inputSelector, queryText);

        // Submit query
        await page.keyboard.press('Enter');
        console.log('Query submitted. Waiting for answer...');

        // Wait for answer container to appear
        await page.waitForSelector(config.selectors.answerContainer, { timeout: 30000 });

        // Faster completion detection:
        // 1. Check for "Stop generating" button disappearance (primary signal)
        // 2. Fallback to text stability check
        console.log('Waiting for answer generation to complete...');

        try {
            // If "Stop generating" button exists, wait for it to detach
            const stopButton = await page.$('button:has-text("Stop generating")');
            if (stopButton) {
                console.log('Found "Stop generating" button, waiting for it to disappear...');
                await page.waitForSelector('button:has-text("Stop generating")', { state: 'detached', timeout: 60000 });
                console.log('Generation complete (button disappeared).');
            } else {
                // Fallback: wait a bit and check stability
                console.log('No "Stop generating" button found, using stability check...');
                let lastText = '';
                let stableCount = 0;
                const maxRetries = 60;

                for (let i = 0; i < maxRetries; i++) {
                    const currentText = await page.textContent(config.selectors.answerContainer);
                    if (currentText && currentText === lastText && currentText.length > 50) {
                        stableCount++;
                        if (stableCount >= 2) { // Stable for 1 second (faster than before)
                            console.log('Answer stabilized.');
                            break;
                        }
                    } else {
                        stableCount = 0;
                        lastText = currentText || '';
                    }
                    await page.waitForTimeout(500);
                }
            }
        } catch (e) {
            console.log('Error during completion check, assuming done:', e);
        }

        const answer = await page.textContent(config.selectors.answerContainer);

        const result = {
            query: queryText,
            answer: answer,
            timestamp: new Date().toISOString(),
            url: page.url()
        };

        // Save result
        const filename = `result-${Date.now()}.json`;
        const filepath = path.join(config.paths.resultsDir, filename);

        if (!fs.existsSync(config.paths.resultsDir)) {
            fs.mkdirSync(config.paths.resultsDir, { recursive: true });
        }

        try {
            fs.writeFileSync(filepath, JSON.stringify(result, null, 2));
            console.log(`Result saved to ${filepath}`);
        } catch (saveError) {
            console.error('Error saving file (permission issue):', saveError);
            console.log('\n--- RESULT (Fallback Output) ---\n');
            console.log(JSON.stringify(result, null, 2));
            console.log('\n--------------------------------\n');
        }

    } catch (error) {
        console.error('Query execution failed:', error);
    } finally {
        await context.close();
        await browser.close();
    }
}
