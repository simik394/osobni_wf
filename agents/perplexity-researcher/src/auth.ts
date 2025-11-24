import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { config } from './config';

// Add stealth plugin
chromium.use(StealthPlugin());

export async function login() {
    console.log('Launching browser with persistent profile...');
    console.log('This browser will remember your login for future runs.');

    // Use persistent context - this saves cookies, localStorage, etc. automatically
    const context = await chromium.launchPersistentContext(config.auth.browserDataPath, {
        headless: false,
        channel: 'chromium' // Use system chromium if available
    });

    const page = context.pages()[0] || await context.newPage();

    try {
        console.log(`Navigating to ${config.url}...`);
        await page.goto(config.url);
        await page.waitForLoadState('networkidle');

        console.log('\n=== INSTRUCTIONS ===');
        console.log('1. Log in to Perplexity manually in this browser window');
        console.log('2. Once logged in, you can close this browser window');
        console.log('3. Your login will be saved automatically');
        console.log('====================\n');

        // Wait for user to close the browser or for a very long time
        console.log('Waiting for you to close the browser after logging in...');

        // We'll just wait for the context to be closed
        await new Promise((resolve) => {
            context.on('close', resolve);
        });

        console.log('Browser closed. Login state has been saved!');

    } catch (error) {
        console.error('Authentication process error:', error);
    }
}
