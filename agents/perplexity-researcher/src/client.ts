import { chromium } from 'playwright-extra';
import type { BrowserContext, Page } from 'playwright';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { config } from './config';
import * as fs from 'fs';
import * as path from 'path';

// Add stealth plugin
chromium.use(StealthPlugin());

export class PerplexityClient {
    private context: BrowserContext | null = null;
    private page: Page | null = null;
    private isInitialized = false;

    async init() {
        if (this.isInitialized) {
            console.log('Client already initialized');
            return;
        }

        if (!fs.existsSync(config.auth.browserDataPath)) {
            throw new Error('Browser profile not found. Please run "perplexity-researcher auth" first to log in.');
        }

        console.log('Launching browser with saved profile...');

        // Use the same persistent context that has the login
        this.context = await chromium.launchPersistentContext(config.auth.browserDataPath, {
            headless: false,
            channel: 'chromium'
        });

        this.page = this.context.pages()[0] || await this.context.newPage();

        // Navigate to Perplexity and wait for it to be ready
        await this.page.goto(config.url);
        console.log('Browser ready');

        this.isInitialized = true;
    }

    async query(queryText: string): Promise<{ query: string; answer: string | null; timestamp: string; url: string }> {
        if (!this.isInitialized || !this.page) {
            throw new Error('Client not initialized. Call init() first.');
        }

        console.log(`Running query: "${queryText}"`);

        try {
            // Navigate to home to start a new query
            await this.page.goto(config.url);

            // Wait for input
            console.log('Looking for query input...');

            const selectors = Array.isArray(config.selectors.queryInput)
                ? config.selectors.queryInput
                : [config.selectors.queryInput];

            let inputSelector = '';
            for (const selector of selectors) {
                try {
                    await this.page.waitForSelector(selector, { timeout: 2000 });
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
            await this.page.fill(inputSelector, queryText);

            // Submit query
            await this.page.keyboard.press('Enter');
            console.log('Query submitted. Waiting for answer...');

            // Wait for answer container to appear
            await this.page.waitForSelector(config.selectors.answerContainer, { timeout: 30000 });

            // Wait for answer generation to complete
            console.log('Waiting for answer generation to complete...');

            try {
                // If "Stop generating" button exists, wait for it to detach
                const stopButton = await this.page.$('button:has-text("Stop generating")');
                if (stopButton) {
                    console.log('Found "Stop generating" button, waiting for it to disappear...');
                    await this.page.waitForSelector('button:has-text("Stop generating")', { state: 'detached', timeout: 60000 });
                    console.log('Generation complete (button disappeared).');
                } else {
                    // Fallback: wait a bit and check stability
                    console.log('No "Stop generating" button found, using stability check...');
                    let lastText = '';
                    let stableCount = 0;
                    const maxRetries = 60;

                    for (let i = 0; i < maxRetries; i++) {
                        const currentText = await this.page.textContent(config.selectors.answerContainer);
                        if (currentText && currentText === lastText && currentText.length > 50) {
                            stableCount++;
                            if (stableCount >= 2) {
                                console.log('Answer stabilized.');
                                break;
                            }
                        } else {
                            stableCount = 0;
                            lastText = currentText || '';
                        }
                        await this.page.waitForTimeout(500);
                    }
                }
            } catch (e) {
                console.log('Error during completion check, assuming done:', e);
            }

            const answer = await this.page.textContent(config.selectors.answerContainer);

            const result = {
                query: queryText,
                answer: answer,
                timestamp: new Date().toISOString(),
                url: this.page.url()
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
            }

            return result;

        } catch (error) {
            console.error('Query execution failed:', error);
            throw error;
        }
    }

    async close() {
        if (this.context) {
            await this.context.close();
            this.context = null;
            this.page = null;
            this.isInitialized = false;
            console.log('Browser closed');
        }
    }
}
