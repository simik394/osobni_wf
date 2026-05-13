const { chromium } = require('playwright');
(async () => {
    const browser = await chromium.connectOverCDP('http://localhost:9224');
    const contexts = browser.contexts();
    const page = contexts[0].pages().find(p => p.url().includes('notebooklm.google.com/notebook/'));
    if (!page) {
        console.log("Notebook page not found");
        process.exit(1);
    }
    
    const panel = page.locator('div.right-panel, section.studio-panel, .studio-panel').first();
    if (await panel.count() > 0) {
        console.log(await panel.innerHTML());
    } else {
        console.log("No right panel");
    }
    process.exit(0);
})();
