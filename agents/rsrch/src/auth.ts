import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { config } from './config';
import * as fs from 'fs';

// Add stealth plugin
chromium.use(StealthPlugin());

export async function login() {
    console.log('Launching browser with persistent profile...');
    console.log('This browser will remember your login for future runs.');

    // Ensure profile dir exists
    if (!fs.existsSync(config.auth.userDataDir)) {
        fs.mkdirSync(config.auth.userDataDir, { recursive: true });
    }

    // Use persistent context - this saves cookies, localStorage, etc. automatically
    const context = await chromium.launchPersistentContext(config.auth.userDataDir, {
        headless: false,
        channel: 'chromium', // Use bundled chromium which usually works better with Playwright
        args: ['--no-sandbox', '--disable-setuid-sandbox'] // basic docker args just in case
    });

    const page = context.pages()[0] || await context.newPage();

    try {
        console.log(`Navigating to ${config.url}...`);
        await page.goto(config.url);

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
        process.exit(0);

    } catch (error) {
        console.error('Authentication process error:', error);
        process.exit(1);
    }
}
