const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
    try {
        console.log("Connecting to browser at 127.0.0.1:9222...");
        const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
        const context = browser.contexts()[0];
        
        let targetPage = null;
        for (const page of context.pages()) {
            const url = page.url();
            console.log("Found page:", url);
            if (url.toLowerCase().includes('moodle') || url.toLowerCase().includes('elearning')) {
                targetPage = page;
                break;
            }
        }
        
        if (!targetPage) {
            console.log("Could not find a Moodle page.");
            await browser.close();
            return;
        }

        console.log("Found Moodle page:", targetPage.url());
        
        // Wait for page to be reasonably loaded
        await targetPage.waitForLoadState('domcontentloaded');

        // Dump the HTML
        const html = await targetPage.evaluate(() => document.body.innerHTML);
        fs.writeFileSync('moodle_dump.html', html);
        console.log("Saved Moodle HTML to moodle_dump.html");

        await browser.close();
    } catch (err) {
        console.error("Error:", err);
    }
})();
