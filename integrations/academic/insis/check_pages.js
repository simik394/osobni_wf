const { chromium } = require('playwright');
(async () => {
    try {
        const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
        console.log("Connected to browser.");
        for (const context of browser.contexts()) {
            for (const page of context.pages()) {
                console.log("Open page:", page.url(), await page.title().catch(()=>"N/A"));
            }
        }
        await browser.close();
    } catch (e) {
        console.error(e);
    }
})();
