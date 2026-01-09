import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { config } from './config';
import logger from './logger';

chromium.use(StealthPlugin());

async function debug() {
    logger.info('Connecting to browser service...');
    logger.info(`Endpoint: ${config.browserWsEndpoint}`);

    const browser = await chromium.connect(config.browserWsEndpoint);

    // Create context with auth state if available
    const context = await browser.newContext({
        storageState: config.auth.authFile
    });

    const page = await context.newPage();

    try {
        logger.info(`Navigating to ${config.url}...`);
        await page.goto(config.url);

        // logger.info('Taking screenshot...');
        // await page.screenshot({ path: 'data/debug-screenshot.png', fullPage: true });
        // logger.info('Screenshot saved to data/debug-screenshot.png');

        // Dump HTML
        const html = await page.content();
        logger.info('HTML Content:');
        logger.info(html);

    } catch (error) {
        logger.error('Debug failed:', error);
    } finally {
        await context.close();
        await browser.close();
    }
}

debug();
