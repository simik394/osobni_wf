
import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

chromium.use(StealthPlugin());

async function run() {
    const password = process.argv[2];
    if (!password) {
        console.error('Please provide password as argument');
        process.exit(1);
    }

    console.log('Connecting to remote browser at localhost:9225...');
    // Connect to the remote browser container
    const browser = await chromium.connectOverCDP('ws://localhost:9225');

    const contexts = browser.contexts();
    const context = contexts[0];
    const pages = context.pages();

    // Find the page with password input
    let targetPage = pages.find(p => p.url().includes('accounts.google.com'));

    if (!targetPage) {
        console.log('No Google login page found. Navigating main page to Gemini...');
        targetPage = pages[0];
        await targetPage.goto('https://gemini.google.com');
        await targetPage.waitForTimeout(2000);

        // Check if we need to click "Sign in"
        const title = await targetPage.title();
        console.log(`Current page: ${title}`);

        if (title.includes('Sign in') || await targetPage.locator('text=Sign in').count() > 0) {
            console.log('Please navigate to password screen via VNC if possible, or this script needs more logic.');
        }
    }

    if (targetPage) {
        console.log(`Targeting page: ${targetPage.url()}`);

        // Check for password input
        const passwordInput = targetPage.locator('input[type="password"]');
        if (await passwordInput.count() > 0) {
            console.log('Found password input! Typing password...');
            await passwordInput.fill(password);
            await targetPage.waitForTimeout(500);
            await passwordInput.press('Enter');
            console.log('Password submitted!');

            // Wait to see if login succeeds
            await targetPage.waitForTimeout(5000);
            console.log(`Final URL: ${targetPage.url()}`);
        } else {
            console.log('Password input not found on this page.');
        }
    }

    await browser.close();
}

run().catch(console.error);
