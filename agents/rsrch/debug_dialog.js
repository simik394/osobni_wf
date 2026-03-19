const { chromium } = require('playwright');
(async () => {
    const b = await chromium.connectOverCDP('http://halvarm:9223');
    const p = b.contexts()[0].pages().find(p => p.url().includes('notebooklm'));
    
    // Check for any input[type="file"] on the whole page
    const fileInputs = p.locator('input[type="file"]');
    const count = await fileInputs.count();
    console.log('Found ' + count + ' file inputs on page:');
    for (let i = 0; i < count; i++) {
        const outerHTML = await fileInputs.nth(i).evaluate(node => node.outerHTML).catch(() => '');
        console.log(`[${i}] HTML: ${outerHTML.substring(0, 300)}`);
    }
    
    await b.close();
})().catch(console.error);
