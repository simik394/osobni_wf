const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
chromium.use(StealthPlugin());

(async () => {
    console.log("Launching headed Playwright browser for VNC...");
    const browser = await chromium.launchPersistentContext(
        '/app/user-data',
        {
            headless: false,
            args: [
                '--remote-debugging-port=9222',
                '--remote-debugging-address=0.0.0.0',
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--window-size=1280,1024',
                '--password-store=basic',
                '--use-mock-keychain'
            ],
            ignoreDefaultArgs: ['--enable-automation']
        }
    );
    
    const pages = browser.pages();
    const page = pages.length > 0 ? pages[0] : await browser.newPage();
    await page.goto('https://notebooklm.google.com/');
    
    console.log("Browser launched successfully. Waiting indefinitely...");
    // Keep process alive indefinitely
    await new Promise(() => {});
})();
