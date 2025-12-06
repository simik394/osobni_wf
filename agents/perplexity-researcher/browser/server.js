const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();

chromium.use(stealth);

(async () => {
    console.log('Starting custom Playwright server (Headful + Enhanced Stealth)...');
    const server = await chromium.launchServer({
        headless: false,
        port: 3000,
        wsPath: 'ws',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-blink-features=AutomationControlled',
            '--disable-infobars',
            '--disable-web-security',
            '--disable-features=IsolateOrigins,site-per-process',
            '--allow-running-insecure-content',
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding',
            '--disable-window-activation',
            '--no-first-run',
            '--no-default-browser-check',
            '--disable-popup-blocking',
            '--disable-translate',
            '--metrics-recording-only',
            '--no-pings',
            '--mute-audio',
            '--start-maximized',
            '--disable-component-extensions-with-background-pages',
            '--disable-ipc-flooding-protection',
            '--enable-features=NetworkService,NetworkServiceInProcess',
            '--force-color-profile=srgb',
            '--disable-features=TranslateUI',
            '--disable-features=BlinkGenPropertyTrees',
            '--user-agent=Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
        ],
        ignoreDefaultArgs: ['--enable-automation', '--enable-blink-features=IdleDetection'],
    });

    console.log('Browser server started on ws://0.0.0.0:3000/ws');
    console.log('Enhanced stealth mode enabled with comprehensive anti-detection');

    // Keep process alive
    process.on('SIGINT', async () => {
        console.log('Shutting down browser server...');
        await server.close();
        process.exit(0);
    });
})();
