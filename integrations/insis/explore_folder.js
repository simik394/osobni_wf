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
            if (page.url().includes('dok_server')) {
                targetPage = page;
                break;
            }
        }

        if (!targetPage) {
            console.log("Could not find a page with 'dok_server' in URL.");
            await browser.close();
            return;
        }

        console.log("Found InSIS document server page.");

        // Find a valid folder URL that contains files (e.g. has (.+) in its label)
        const validFolderUrl = await targetPage.evaluate(() => {
            const labels = document.querySelectorAll('.node-label');
            for (let label of labels) {
                if (label.innerText.match(/\(\s*\d+\s*(?:\/\s*\d+\s*)?\)/)) {
                    const a = label.querySelector('a');
                    if (a && a.href) return a.href;
                }
            }
            return null;
        });

        if (!validFolderUrl) {
            console.log("No valid folder with files found.");
            await browser.close();
            return;
        }

        console.log("Found valid folder URL:", validFolderUrl);

        // Open a new page to not disturb the tree
        const explorePage = await context.newPage();
        console.log("Navigating to folder view...");
        await explorePage.goto(validFolderUrl, { waitUntil: 'domcontentloaded' });

        // Dump the HTML of the folder
        const folderHtml = await explorePage.evaluate(() => document.body.innerHTML);
        fs.writeFileSync('folder_dump.html', folderHtml);
        console.log("Saved folder HTML to folder_dump.html");

        await explorePage.close();

        await browser.close();
        console.log("Disconnected.");
    } catch (err) {
        console.error("Error:", err);
    }
})();
