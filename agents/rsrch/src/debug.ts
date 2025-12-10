import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { config } from './config';

chromium.use(StealthPlugin());

async function debug() {
    console.log('Connecting to browser service...');
    console.log(`Endpoint: ${config.browserWsEndpoint}`);

    const browser = await chromium.connect(config.browserWsEndpoint);

    // Create context with auth state if available
    const context = await browser.newContext({
        storageState: config.auth.authFile
    });

    const page = await context.newPage();

    try {
        console.log(`Navigating to ${config.url}...`);
        await page.goto(config.url);

        // console.log('Taking screenshot...');
        // await page.screenshot({ path: 'data/debug-screenshot.png', fullPage: true });
        // console.log('Screenshot saved to data/debug-screenshot.png');

        // Dump HTML
        const html = await page.content();
        console.log('HTML Content:');
        console.log(html);

    } catch (error) {
        console.error('Debug failed:', error);
    } finally {
        await context.close();
        await browser.close();
    }
}

debug();
