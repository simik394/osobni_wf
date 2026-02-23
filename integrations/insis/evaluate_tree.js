const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
    try {
        console.log("Connecting to browser...");
        const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
        console.log("Connected.");
        const context = browser.contexts()[0];
        const pages = context.pages();

        let targetPage = null;
        for (const page of pages) {
            console.log("Page URL:", page.url());
            if (page.url().includes('dok_server')) {
                targetPage = page;
                break;
            }
        }

        if (targetPage) {
            console.log("Found InSIS document server page.");
            // Print the main container of the tree
            const treeHtml = await targetPage.evaluate(() => {
                const treeElement = document.querySelector('#tree') || document.querySelector('.tree') || document.querySelector('table');
                return document.body.innerHTML;
            });
            fs.writeFileSync('tree_dump.html', treeHtml);
            console.log("Saved full body HTML to tree_dump.html");
        } else {
            console.log("Could not find a page with 'dok_server' in URL.");
        }
        // Do NOT close the browser since it's the user's browser!
        // We only disconnect
        await browser.close();
        console.log("Disconnected.");
    } catch (err) {
        console.error("Error:", err);
    }
})();
