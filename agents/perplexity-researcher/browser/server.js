const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();

chromium.use(stealth);

(async () => {
    console.log('Starting custom Playwright server (Headful + Stealth)...');
    const server = await chromium.launchServer({
        headless: false,
        port: 3000,
        wsPath: 'ws',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-blink-features=AutomationControlled',
            '--user-agent=Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        ]
    });
    console.log('Browser server started on ws://0.0.0.0:3000/ws');
})();
