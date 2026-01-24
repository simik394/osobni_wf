
import puppeteer from 'puppeteer-core';
import axios from 'axios';

async function main() {
    console.log("=== AUTH CHECK (Containerized Browser) ===");

    const versionUrl = 'http://127.0.0.1:9225/json/version';
    const resp = await axios.get(versionUrl);
    let wsUrl: string = resp.data.webSocketDebuggerUrl;
    wsUrl = wsUrl.replace('chromium:9223', '127.0.0.1:9225');
    console.log(`Connecting: ${wsUrl}`);

    const browser = await puppeteer.connect({
        browserWSEndpoint: wsUrl,
        defaultViewport: null,
    });

    const page = await browser.newPage();

    // Navigate to Jules dashboard
    await page.goto('https://jules.google.com/', { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 5000));

    const title = await page.title();
    const url = page.url();

    console.log(`Title: ${title}`);
    console.log(`URL: ${url}`);

    // Check for login indicators
    const bodyText = await page.evaluate(() => document.body.innerText.substring(0, 500));
    console.log(`Body text (first 500 chars):\n${bodyText}`);

    await page.screenshot({ path: '/tmp/auth_check.png', fullPage: true });
    console.log("Screenshot: /tmp/auth_check.png");

    await page.close();
    browser.disconnect();
}

main().catch(console.error);
