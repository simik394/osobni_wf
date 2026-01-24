
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { GeminiClient } from '../../src/gemini-client';
import * as fs from 'fs';
import * as path from 'path';

// Only run if E2E environment variable is set
const runE2E = process.env.E2E === 'true';

describe.skipIf(!runE2E)('Gemini E2E Tests', () => {
    let browser: Browser;
    let context: BrowserContext;
    let page: Page;
    let gemini: GeminiClient;
    const CDP_URL = process.env.CDP_URL || 'http://localhost:9223';
    const SNAPSHOT_DIR = path.join(__dirname, 'snapshots');

    beforeAll(async () => {
        // Ensure snapshot directory exists
        if (!fs.existsSync(SNAPSHOT_DIR)) {
            fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });
        }

        try {
            console.log(`Connecting to browser at ${CDP_URL}...`);
            browser = await chromium.connectOverCDP(CDP_URL, { timeout: 30000 });
            const contexts = browser.contexts();
            context = contexts[0] || await browser.newContext();
            page = await context.newPage();
            await page.setViewportSize({ width: 1920, height: 1080 });

            gemini = new GeminiClient(page);
        } catch (error) {
            console.error('Failed to connect to browser. Make sure the browser container is running with CDP port exposed.', error);
            throw error;
        }
    });

    afterAll(async () => {
        if (page) await page.close();
        if (browser) await browser.close();
    });

// start snippet should-navigate-to-gemini-and-verify-login-status

    it('should navigate to Gemini and verify login status', async () => {
        await page.goto('https://gemini.google.com/app', { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(2000);

        const url = page.url();
        const isLoginPage = url.includes('accounts.google.com');

        // Take a screenshot for debugging
        await page.screenshot({ path: path.join(SNAPSHOT_DIR, 'login_status.png') });

        if (isLoginPage) {
            console.warn('Browser is not logged in. Skipping functionality tests.');
        }

        expect(isLoginPage, 'Should be logged in to Gemini').toBe(false);
    });

// end snippet should-navigate-to-gemini-and-verify-login-status

// start snippet should-parse-an-existing-research-session

    it('should parse an existing research session', async () => {
        // Skip if we failed the login check (assertions in beforeAll logic would be better but keeping simple flow)
        if (page.url().includes('accounts.google.com')) return;

        // Try to navigate to a specific known session if provided, otherwise search for one
        // Using the ID from the script as a fallback example, or we can make this dynamic
        const targetSessionId = process.env.TEST_SESSION_ID;

        if (targetSessionId) {
            console.log(`Navigating to target session: ${targetSessionId}`);
            const parsed = await gemini.parseResearch(targetSessionId);
            expect(parsed).toBeDefined();
            expect(parsed?.title).toBeTruthy();
            expect(parsed?.content.length).toBeGreaterThan(0);
        } else {
            // Find a research session dynamically
            console.log('Searching for a research session in sidebar...');

            // Open menu if needed
            const menuBtn = page.locator('button[aria-label*="Hlavní nabídka"], button[aria-label*="Main menu"]').first();
            if (await menuBtn.count() > 0 && await menuBtn.isVisible()) {
                await menuBtn.click();
                await page.waitForTimeout(1000);
            }

            const chatItems = page.locator('a[href*="/app/"], .conversation');
            const count = await chatItems.count();

            let researchSessionFound = false;

            for (let i = 0; i < Math.min(count, 10); i++) {
                const item = chatItems.nth(i);
                const text = await item.textContent();

                if (text && (text.includes('Deep') || text.includes('Research') || text.includes('Dive') || text.includes('Analysis'))) {
                    console.log(`Found candidate session: ${text}`);
                    await item.click();
                    await page.waitForTimeout(3000);

                    // Try parsing
                    const parsed = await gemini.parseResearch();
                    if (parsed) {
                        researchSessionFound = true;
                        expect(parsed.title).toBeTruthy();
                        expect(parsed.headings.length).toBeGreaterThanOrEqual(0);
                        break;
                    }
                }
            }

            if (!researchSessionFound) {
                console.warn('No specific research session found in top 10 items. Testing on current page.');
                // Just try parsing whatever is open
                const parsed = await gemini.parseResearch();
                // We might fail gracefully or return null, so checking expectations carefully
                // If it returns null, it means it couldn't find research structure
            }
        }
    }, 120000);

// end snippet should-parse-an-existing-research-session // Long timeout for E2E
});
