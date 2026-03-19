const { chromium } = require('playwright');

/**
 * Connects to an existing Chrome instance via CDP (default 127.0.0.1:9222)
 */
async function connectToBrowser(cdpUrl = 'http://127.0.0.1:9222') {
    try {
        const browser = await chromium.connectOverCDP(cdpUrl);
        const context = browser.contexts()[0];
        if (!context) throw new Error("No active browser context found at " + cdpUrl);
        return { browser, context };
    } catch (e) {
        throw new Error(`Failed to connect to browser over CDP (${cdpUrl}): ${e.message}`);
    }
}

/**
 * Standardized navigation with better wait states
 */
async function smartGoto(page, url, timeout = 3000) {
    await page.goto(url, { waitUntil: 'networkidle' });
    if (timeout > 0) await new Promise(r => setTimeout(r, timeout));
}

module.exports = { connectToBrowser, smartGoto };
