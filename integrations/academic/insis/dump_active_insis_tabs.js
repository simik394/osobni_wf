const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
    try {
        const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
        console.log("Connected to browser.");
        let pageCount = 0;
        for (const context of browser.contexts()) {
            for (const page of context.pages()) {
                const url = page.url();
                if (url.includes('insis.vse.cz')) {
                    pageCount++;
                    const title = (await page.title().catch(() => "Unknown")).replace(/[^a-z0-9]/gi, '_');
                    const html = await page.content();
                    fs.writeFileSync(`insis_dump_${pageCount}_${title}.html`, html, 'utf8');
                    console.log(`Saved ${url} -> insis_dump_${pageCount}_${title}.html`);
                }
            }
        }
        await browser.close();
    } catch (e) {
        console.error(e);
    }
})();
