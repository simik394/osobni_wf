import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { config } from './config';
import * as fs from 'fs';
import * as path from 'path';
import logger from './logger';

// Add stealth plugin
chromium.use(StealthPlugin());

export async function login(userDataDir?: string) {
    const finalDir = userDataDir || config.auth.userDataDir;
    logger.info(`Launching browser with persistent profile at: ${finalDir}`);
    logger.info('This browser will remember your login for future runs.');

    // Ensure profile dir exists
    if (!fs.existsSync(finalDir)) {
        fs.mkdirSync(finalDir, { recursive: true });
    }

    // Use persistent context - this saves cookies, localStorage, etc. automatically
    const context = await chromium.launchPersistentContext(finalDir, {
        headless: false,
        channel: 'chromium',
        slowMo: 100, // USER RULE: Always use slowmo for Google accounts to avoid detection
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-blink-features=AutomationControlled'
        ],
        ignoreDefaultArgs: ['--enable-automation']
    });

    const page = context.pages()[0] || await context.newPage();

    try {
        logger.info(`Navigating to ${config.url} ...`);
        await page.goto(config.url);

        // Also open NotebookLM in a new tab
        logger.info('Opening NotebookLM in a new tab...');
        const page2 = await context.newPage();
        await page2.goto('https://notebooklm.google.com/');

        console.log('\n=== INSTRUCTIONS ===');
        console.log('1. Log in to Perplexity manually in the first tab');
        console.log('2. Log in to Google/NotebookLM in the second tab');
        console.log('3. Once logged in to BOTH, you can close this browser window');
        console.log('4. Your login will be saved automatically');
        console.log('====================\n');

        // Wait for user to close the browser or for a very long time
        logger.info('Waiting for you to close the browser after logging in...');

        // We'll just wait for the context to be closed
        await new Promise((resolve) => {
            context.on('close', resolve);
        });

        // Save auth.json for profile visibility
        const state = await context.storageState();
        const authFile = path.join(path.dirname(finalDir), 'auth.json');
        fs.writeFileSync(authFile, JSON.stringify(state, null, 2));

        logger.info(`Login state has been saved to ${finalDir} and ${authFile}`);
        process.exit(0);

    } catch (error) {
        logger.error('Authentication process error:', error);
        process.exit(1);
    }
}
