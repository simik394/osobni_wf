import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { config } from './config';
import { selectors } from './selectors';
import * as fs from 'fs';
import * as path from 'path';
import logger from './services/logger';
import { BrowserClient } from './clients/base';

// Add stealth plugin
chromium.use(StealthPlugin());

export async function runQuery(queryText: string) {
    logger.info(`Running query: "${queryText}"`);

    const client = new BrowserClient({ verbose: true });
    
    try {
        await client.init({ 
            profileId: 'default', 
            cdpEndpoint: config.browserWsEndpoint || process.env.BROWSER_CDP_ENDPOINT 
        });

        const page = await client.getTabPage('perplexity');

        // Navigace na Perplexity
        const currentUrl = page.url();
        if (!currentUrl.includes('perplexity.ai')) {
            await page.goto(config.urls.perplexity, { waitUntil: 'domcontentloaded' });
        }
        // await page.waitForLoadState('networkidle'); // Too slow

        // Wait for input - faster check
        logger.info('Looking for query input...');

        const qSelectors = Array.isArray(selectors.perplexity.queryInput)
            ? selectors.perplexity.queryInput
            : [selectors.perplexity.queryInput];

        let inputSelector = '';
        for (const selector of qSelectors) {
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
        await page.waitForSelector(selectors.perplexity.answerContainer, { timeout: 30000 });

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
                    const currentText = await page.textContent(selectors.perplexity.answerContainer);
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

        const answer = await page.textContent(selectors.perplexity.answerContainer);

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
        await client.release();
        await client.close();
    }
}
