import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { config } from './config';
import * as fs from 'fs';
import * as path from 'path';

// Add stealth plugin
chromium.use(StealthPlugin());

export async function runQuery(queryText: string) {
    console.log(`Running query: "${queryText}"`);

    if (!fs.existsSync(config.auth.browserDataPath)) {
        console.error('Browser profile not found. Please run "npm run auth" first to log in.');
        return;
    }

    console.log('Launching browser with saved profile...');

    // Use the same persistent context that has the login
    const context = await chromium.launchPersistentContext(config.auth.browserDataPath, {
        headless: false, // Set to true for headless mode
        channel: 'chromium'
    });

    const page = context.pages()[0] || await context.newPage();

    try {
        await page.goto(config.url);
        await page.waitForLoadState('networkidle');

        // Wait for input
        console.log('Looking for query input...');

        const selectors = Array.isArray(config.selectors.queryInput)
            ? config.selectors.queryInput
            : [config.selectors.queryInput];

        let inputSelector = '';
        for (const selector of selectors) {
            try {
                console.log(`Trying selector: ${selector}`);
                await page.waitForSelector(selector, { timeout: 5000 });
                inputSelector = selector;
                console.log(`Found input with selector: ${selector}`);
                break;
            } catch (e) {
                console.log(`Selector ${selector} not found.`);
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

        // Wait for answer container
        await page.waitForSelector(config.selectors.answerContainer, { timeout: 60000 });

        // Wait for generation to finish
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(5000); // Extra buffer

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
    }
}
