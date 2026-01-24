
import puppeteer from 'puppeteer-core';
import axios from 'axios';

async function main() {
    console.log("Testing button detection on known session...");

    const resp = await axios.get('http://127.0.0.1:9225/json/version');
    let wsUrl: string = resp.data.webSocketDebuggerUrl;
    wsUrl = wsUrl.replace('chromium:9223', '127.0.0.1:9225');
    console.log("WS:", wsUrl);

    const browser = await puppeteer.connect({ browserWSEndpoint: wsUrl, defaultViewport: null });
    const page = await browser.newPage();

    // Session that worked in proof earlier
    console.log("Navigating to session 10336333082179132854...");
    await page.goto('https://jules.google.com/session/10336333082179132854', { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 5000));

    console.log("Page loaded. URL:", page.url());
    console.log("Title:", await page.title());

    // Check for buttons
    const publishBtn = await page.$('::-p-text("Publish PR")');
    console.log("Publish PR found:", publishBtn !== null);

    const publishBranch = await page.$('::-p-text("Publish branch")');
    console.log("Publish branch found:", publishBranch !== null);

    const viewPr = await page.$('::-p-text("View PR")');
    console.log("View PR found:", viewPr !== null);

    const readyForReview = await page.$('::-p-text("Ready for review")');
    console.log("Ready for review found:", readyForReview !== null);

    await page.close();
    browser.disconnect();
    console.log("Done");
}

main().catch(console.error);
