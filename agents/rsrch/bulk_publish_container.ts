
import puppeteer from 'puppeteer-core';
import axios from 'axios';
import fs from 'fs';

async function main() {
    console.log("=== BULK PUBLISH (Using Puppeteer ::-p-text) ===");

    const versionUrl = 'http://127.0.0.1:9225/json/version';
    const resp = await axios.get(versionUrl);
    let wsUrl: string = resp.data.webSocketDebuggerUrl;
    wsUrl = wsUrl.replace('chromium:9223', '127.0.0.1:9225');
    console.log(`Connecting: ${wsUrl}`);

    const browser = await puppeteer.connect({
        browserWSEndpoint: wsUrl,
        defaultViewport: null,
    });

    const content = fs.readFileSync('/tmp/fresh_sessions.json', 'utf8');
    const sessions = JSON.parse(content);
    console.log(`Found ${sessions.length} sessions.`);

    const page = await browser.newPage();
    let published = 0, skipped = 0, errors = 0;

    for (const s of sessions) {
        console.log(`[${s.id}]...`);
        try {
            await page.goto(`https://jules.google.com/session/${s.id}`, { waitUntil: 'domcontentloaded' });
            await new Promise(r => setTimeout(r, 4000)); // Wait for JS rendering

            // Try Puppeteer's ::-p-text selector for Shadow DOM piercing
            const publishBtn = await page.$('::-p-text("Publish PR")') || await page.$('::-p-text("Publish branch")');
            if (publishBtn) {
                console.log(`  -> Clicking Publish...`);
                await publishBtn.click();
                await new Promise(r => setTimeout(r, 5000));
                published++;
                continue;
            }

            // Check if already published
            const viewPrBtn = await page.$('::-p-text("View PR")') || await page.$('::-p-text("Update branch")');
            if (viewPrBtn) {
                console.log(`  -> Already published`);
                skipped++;
                continue;
            }

            console.log(`  -> Unknown state`);
            skipped++;

        } catch (e: any) {
            console.log(`  -> Error: ${e.message}`);
            errors++;
        }
        await new Promise(r => setTimeout(r, 1000));
    }

    console.log(`\n=== DONE: Published=${published} Skipped=${skipped} Errors=${errors} ===`);
    await page.close();
    browser.disconnect();
}

main().catch(console.error);
