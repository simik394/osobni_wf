const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function main() {
    console.log('Connecting to halvarm:9223...');
    const browser = await chromium.connectOverCDP('http://halvarm:9223');
    const context = browser.contexts()[0];
    const pages = context.pages();
    console.log(`Found ${pages.length} pages.`);
    for (let i = 0; i < pages.length; i++) {
        const p = pages[i];
        console.log(`Page ${i} URL: ${p.url()}`);
        const screenshotPath = path.join(process.cwd(), `debug_notebooklm_${i}.png`);
        await p.screenshot({ path: screenshotPath });
        console.log(`Screenshot saved to ${screenshotPath}`);
    }
    
    await browser.close();
}

main().catch(console.error);
