
import puppeteer from 'puppeteer-core';
import axios from 'axios';

async function main() {
    const versionUrl = 'http://127.0.0.1:9225/json/version';
    const resp = await axios.get(versionUrl);
    let wsUrl: string = resp.data.webSocketDebuggerUrl;
    wsUrl = wsUrl.replace('chromium:9223', '127.0.0.1:9225');

    const browser = await puppeteer.connect({
        browserWSEndpoint: wsUrl,
        defaultViewport: null,
    });

    const page = await browser.newPage();
    // Navigate to Google accounts page for account switching
    await page.goto('https://accounts.google.com/', { waitUntil: 'domcontentloaded' });
    console.log("Navigated to Google Accounts - check VNC to switch accounts");

    browser.disconnect();
}

main().catch(console.error);
