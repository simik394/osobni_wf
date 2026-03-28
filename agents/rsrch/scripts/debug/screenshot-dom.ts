import { chromium } from 'playwright';

async function run() {
    const wsUrl = "ws://halvarm:9223/devtools/browser/cb116738-43ec-48ba-91c5-06ed0fee6d57";
    const browser = await chromium.connectOverCDP(wsUrl);
    const contexts = browser.contexts();
    const page = contexts[0].pages().find(p => p.url().includes('notebooklm.google.com'));
    
    await page.screenshot({ path: '/home/sim/.gemini/antigravity/brain/a688ac86-871a-4dde-ba4f-9e9a19dfc1c3/notebook_home_debug.png' });
    console.log("Screenshot saved.");
    await browser.disconnect();
}
run().catch(console.error);
