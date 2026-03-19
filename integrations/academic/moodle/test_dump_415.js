const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
    try {
        const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
        const contexts = browser.contexts();
        
        let foundPage = null;
        for (const context of contexts) {
            for (const page of context.pages()) {
                if (page.url().includes('moodle.vse.cz')) {
                    foundPage = page;
                    break;
                }
            }
        }
        
        if (foundPage) {
            const html = await foundPage.content();
            fs.writeFileSync('dump_415.html', html, 'utf8');
            console.log('Saved dump_415.html for ' + foundPage.url());
        } else {
            console.log('Page not found');
        }
        await browser.close();
    } catch (e) {
        console.error(e);
    }
})();
