
import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import * as fs from 'fs';
import * as path from 'path';

chromium.use(StealthPlugin());

(async () => {
    try {
        const cdpEndpoint = process.env.BROWSER_CDP_ENDPOINT;
        const wsEndpoint = process.env.BROWSER_WS_ENDPOINT;

        let browser;
        if (wsEndpoint) {
            console.log(`Connecting to browser via WS at ${wsEndpoint}...`);
            browser = await chromium.connect(wsEndpoint);
        } else {
            console.log(`Connecting to browser via CDP...`);
            browser = await chromium.connectOverCDP(cdpEndpoint || 'http://localhost:9223');
        }

        const context = browser.contexts()[0] || await browser.newContext();

        const authPath = '/secrets/auth.json';
        if (fs.existsSync(authPath)) {
            try {
                const state = JSON.parse(fs.readFileSync(authPath, 'utf-8'));
                if (state.cookies) {
                    await context.addCookies(state.cookies);
                    console.log(`Loaded ${state.cookies.length} cookies.`);
                }
            } catch (e) { console.error("Failed to load auth:", e); }
        }

        const page = await context.newPage();

        console.log("Navigating to Gemini...");
        await page.goto('https://gemini.google.com/app', { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(3000);

        console.log(`Current URL: ${page.url()}`);
        console.log(`Page Title: ${await page.title()}`);

        // Handle Consent
        if ((await page.title()).includes("Before you continue") || page.url().includes("consent.google.com")) {
            console.log("Consent screen detected. Trying to accept...");
            const acceptBtn = page.locator('button:has-text("Accept all"), button:has-text("Alle akzeptieren")');
            if (await acceptBtn.count() > 0) {
                await acceptBtn.first().click();
                console.log("Clicked Accept All.");
                await page.waitForTimeout(5000); // Wait for redirect
            } else {
                console.warn("Consent button not found!");
            }
            console.log(`New URL: ${page.url()}`);
        }

        if (page.url().includes('accounts.google.com')) {
            console.error("Redirected to Login - Auth Failed!");
            await browser.close();
            return;
        }

        console.log("Looking for history items...");

        // Try multiple selectors based on common Gemini structure
        // 1. Links with /app/ in href (within navigation)
        // 2. Roles 'link' inside navigation landmark

        const historyItems = await page.$$('a[href^="/app/"]');
        console.log(`Found ${historyItems.length} items via generic selector.`);

        const sessions = [];
        const seen = new Set();

        for (const item of historyItems) {
            const text = await item.innerText();
            const href = await item.getAttribute('href');
            // Basic filtering
            if (text && href && href.split('/').length > 2 && !seen.has(href)) {
                // Remove newlines and trim
                const cleanText = text.replace(/\n/g, ' ').trim();
                if (cleanText.length > 0 && cleanText !== "Gemini") {
                    sessions.push({ title: cleanText, url: 'https://gemini.google.com' + href });
                    seen.add(href);
                }
            }
        }

        // Limit output
        const recent = sessions.slice(0, 10);
        console.log(JSON.stringify(recent, null, 2));

        await browser.close();

    } catch (e) {
        console.error("Error:", e);
        process.exit(1);
    }
})();
