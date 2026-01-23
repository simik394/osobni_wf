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
    // Connect via CDP instead of local launch
    let context;

    // Priority: WS Endpoint > CDP Endpoint > Debugging Port
    let endpoint = config.browserWsEndpoint || config.browserCdpEndpoint;

    if (endpoint) {
        logger.info(`Connecting to remote browser at ${endpoint}...`);
        const browser = await chromium.connect(endpoint);
        context = await browser.newContext(); // Or use contexts()[0] matches logic in client.ts
    } else {
        const port = config.remoteDebuggingPort || 9222;
        const cdpUrl = `http://localhost:${port}`;
        logger.info(`Connecting to remote browser via CDP at ${cdpUrl}...`);

        try {
            // Try connecting using the improved logic from client.ts (simplified here)
            const browser = await chromium.connectOverCDP(cdpUrl);
            const contexts = browser.contexts();
            if (contexts.length > 0) {
                context = contexts[0];
                logger.info('Attached to existing browser session.');
            } else {
                context = await browser.newContext();
                logger.info('Created new context in remote browser.');
            }
        } catch (e: any) {
            throw new Error(`Failed to connect to browser service. STRICT POLICY prohibits local launch. 
             Ensure a browser is running with remote debugging enabled (e.g., port ${port}).
             Error: ${e.message}`);
        }
    }

    if (!context) throw new Error('Failed to acquire browser context.');

    const page = await context.newPage();

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
        console.log('3. Once logged in to BOTH, keep this window open or Ctrl+C if finished.');
        console.log('   (Note: Auth state saving via CDP depends on the remote browser persistence)');
        console.log('====================\n');

        // Wait for user to close the browser or for a very long time
        logger.info('Waiting loop active. Press Ctrl+C to exit.');

        // Keep alive
        await new Promise(() => { });

    } catch (error) {
        logger.error('Authentication process error:', error);
        process.exit(1);
    }
}
