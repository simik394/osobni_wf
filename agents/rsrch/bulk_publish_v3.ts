
import puppeteer from 'puppeteer-core';
import axios from 'axios';

async function main() {
    console.log("=== BULK PUBLISH v3 - Simple Iterate Through Session List ===");

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

    // Step 1: Get sessions from the sidebar 
    console.log("Loading Jules...");
    await page.goto('https://jules.google.com/session', { waitUntil: 'networkidle0', timeout: 60000 });
    await new Promise(r => setTimeout(r, 5000));

    // Click "Recent sessions" in sidebar to ensure we see all
    try {
        const recentBtn = await page.$('::-p-text("Recent sessions")');
        if (recentBtn) await recentBtn.click();
        await new Promise(r => setTimeout(r, 2000));
    } catch (e) { }

    // Load more sessions by scrolling the sidebar
    for (let i = 0; i < 15; i++) {
        await page.evaluate(() => {
            const sidebar = document.querySelector('[role="navigation"]') || document.querySelector('aside');
            if (sidebar) sidebar.scrollTop = sidebar.scrollHeight;
        });
        await new Promise(r => setTimeout(r, 500));
    }

    // Extract session IDs from sidebar links
    const sessionIds = await page.evaluate(() => {
        const ids: string[] = [];
        document.querySelectorAll('a').forEach((a: any) => {
            const href = a.getAttribute('href') || '';
            const match = href.match(/\/session\/(\d+)/);
            if (match) ids.push(match[1]);
        });
        return [...new Set(ids)];
    });

    console.log(`Found ${sessionIds.length} sessions`);

    let published = 0, skipped = 0, errors = 0;

    for (const id of sessionIds) {
        process.stdout.write(`[${id}] `);

        try {
            await page.goto(`https://jules.google.com/session/${id}`, { waitUntil: 'domcontentloaded', timeout: 20000 });
            await new Promise(r => setTimeout(r, 3000));

            const publishBtn = await page.$('::-p-text("Publish PR")') || await page.$('::-p-text("Publish branch")');
            if (publishBtn) {
                await publishBtn.click();
                await new Promise(r => setTimeout(r, 4000));
                console.log('Published ✓');
                published++;
            } else {
                const viewBtn = await page.$('::-p-text("View PR")');
                if (viewBtn) {
                    console.log('Already published');
                    skipped++;
                } else {
                    console.log('Skipped');
                    skipped++;
                }
            }
        } catch (e: any) {
            console.log(`Error: ${e.message.substring(0, 30)}`);
            errors++;
        }
    }

    console.log(`\n=== DONE: P=${published} S=${skipped} E=${errors} / Total=${sessionIds.length} ===`);
    await page.close();
    browser.disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
