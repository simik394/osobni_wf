import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { config } from './config';
import * as fs from 'fs';
import * as path from 'path';
import logger from './logger';

// Add stealth plugin
chromium.use(StealthPlugin());

export async function runQuery(queryText: string) {
    logger.info(`Running query: "${queryText}"`);

    if (!fs.existsSync(config.auth.authFile)) {
        logger.error(`Auth file not found at ${config.auth.authFile}. Please run "npm run auth" first to log in.`);
        return;
    }

    let browser;
    if (config.browserWsEndpoint) {
        logger.info(`Connecting to browser service at ${config.browserWsEndpoint}...`);
        browser = await chromium.connect(config.browserWsEndpoint);
    } else {
        // logger.info('Launching local browser (System Chrome)...');
        // browser = await chromium.launch({ headless: false, channel: 'chrome' });
        throw new Error('STRICT POLICY: Local browser launch PROHIBITED. Please check browser service connection.');
    }

    logger.info('Creating context with saved auth state...');
    const context = await browser.newContext({
        storageState: config.auth.authFile
    });

    const page = await context.newPage();

    try {
        await page.goto(config.url);
        // await page.waitForLoadState('networkidle'); // Too slow

        // Wait for input - faster check
        logger.info('Looking for query input...');

        const selectors = Array.isArray(config.selectors.queryInput)
            ? config.selectors.queryInput
            : [config.selectors.queryInput];

        let inputSelector = '';
        for (const selector of selectors) {
            try {
                // Reduced timeout for faster failover
                await page.waitForSelector(selector, { timeout: 2000 });
                inputSelector = selector;
                logger.info(`Found input with selector: ${selector}`);
                break;
            } catch (e) {
                // Continue to next selector
            }
        }

        if (!inputSelector) {
            throw new Error('Could not find query input field with any known selector.');
        }

        logger.info('Typing query...');
        await page.fill(inputSelector, queryText);

        // Submit query
        await page.keyboard.press('Enter');
        logger.info('Query submitted. Waiting for answer...');

        // Wait for answer container to appear
        await page.waitForSelector(config.selectors.answerContainer, { timeout: 30000 });

        // Faster completion detection:
        // 1. Check for "Stop generating" button disappearance (primary signal)
        // 2. Fallback to text stability check
        logger.info('Waiting for answer generation to complete...');

        try {
            // If "Stop generating" button exists, wait for it to detach
            const stopButton = await page.$('button:has-text("Stop generating")');
            if (stopButton) {
                logger.info('Found "Stop generating" button, waiting for it to disappear...');
                await page.waitForSelector('button:has-text("Stop generating")', { state: 'detached', timeout: 60000 });
                logger.info('Generation complete (button disappeared).');
            } else {
                // Fallback: wait a bit and check stability
                logger.info('No "Stop generating" button found, using stability check...');
                let lastText = '';
                let stableCount = 0;
                const maxRetries = 60;

                for (let i = 0; i < maxRetries; i++) {
                    const currentText = await page.textContent(config.selectors.answerContainer);
                    if (currentText && currentText === lastText && currentText.length > 50) {
                        stableCount++;
                        if (stableCount >= 2) { // Stable for 1 second (faster than before)
                            logger.info('Answer stabilized.');
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
            logger.info('Error during completion check, assuming done:', e);
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
            logger.info(`Result saved to ${filepath}`);
        } catch (saveError) {
            logger.error('Error saving file (permission issue):', saveError);
            logger.info('\n--- RESULT (Fallback Output) ---\n');
            logger.info(JSON.stringify(result, null, 2));
            logger.info('\n--------------------------------\n');
        }

    } catch (error) {
        logger.error('Query execution failed:', error);
    } finally {
        await context.close();
        await browser.close();
    }
}
