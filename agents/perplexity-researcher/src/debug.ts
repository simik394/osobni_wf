import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { config } from './config';

chromium.use(StealthPlugin());

async function debug() {
    console.log('Launching browser for debugging...');
    const context = await chromium.launchPersistentContext(config.auth.browserDataPath, {
        headless: false,
        channel: 'chromium'
    });

    const page = context.pages()[0] || await context.newPage();

    try {
        console.log(`Navigating to ${config.url}...`);
        await page.goto(config.url);
        await page.waitForLoadState('networkidle');

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
    }
}

debug();
