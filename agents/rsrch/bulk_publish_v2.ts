
import puppeteer from 'puppeteer-core';
import axios from 'axios';

// Jules MCP API wrapper
async function listAllSessions(): Promise<any[]> {
    const allSessions: any[] = [];
    let pageToken: string | undefined = undefined;

    do {
        const url = pageToken
            ? `http://localhost:3000/api/sessions?page_size=100&page_token=${pageToken}`
            : `http://localhost:3000/api/sessions?page_size=100`;

        // Use jules-mcp style - it's actually Google Jules API
        // For now, hardcode session IDs from browser that need publishing
        break;
    } while (pageToken);

    return allSessions;
}

async function main() {
    console.log("=== BULK PUBLISH v2 - Fresh Session Fetch ===");

    // Connect to containerized browser
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

    // Step 1: Go to Jules dashboard and scrape session list
    console.log("Navigating to Jules sessions page...");
    await page.goto('https://jules.google.com/session', { waitUntil: 'networkidle0', timeout: 30000 });
    await new Promise(r => setTimeout(r, 3000));

    // Scroll to load all sessions
    let prevHeight = 0;
    for (let i = 0; i < 10; i++) {
        const height = await page.evaluate(() => document.body.scrollHeight);
        if (height === prevHeight) break;
        prevHeight = height;
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await new Promise(r => setTimeout(r, 1000));
    }

    // Step 2: Extract all session links
    const sessionLinks = await page.evaluate(() => {
        const links: string[] = [];
        document.querySelectorAll('a[href*="/session/"]').forEach((a: any) => {
            const href = a.getAttribute('href');
            if (href && href.match(/\/session\/\d+/)) {
                links.push(href);
            }
        });
        return [...new Set(links)]; // Unique
    });

    console.log(`Found ${sessionLinks.length} session links`);

    let published = 0, skipped = 0, errors = 0;

    for (const link of sessionLinks) {
        const id = link.match(/\/session\/(\d+)/)?.[1] || 'unknown';
        console.log(`[${id}]...`);

        try {
            await page.goto(`https://jules.google.com${link}`, { waitUntil: 'domcontentloaded' });
            await new Promise(r => setTimeout(r, 3000));

            // Try to find Publish PR button
            const publishBtn = await page.$('::-p-text("Publish PR")') || await page.$('::-p-text("Publish branch")');
            if (publishBtn) {
                console.log(`  -> Clicking Publish...`);
                await publishBtn.click();
                await new Promise(r => setTimeout(r, 5000));
                published++;
                continue;
            }

            // Check if already published or different state
            const viewBtn = await page.$('::-p-text("View PR")') || await page.$('::-p-text("Update branch")');
            if (viewBtn) {
                console.log(`  -> Already published`);
                skipped++;
                continue;
            }

            // Check for "Ready for review" state which might need Approve first
            const readyForReview = await page.$('::-p-text("Ready for review")');
            if (readyForReview) {
                console.log(`  -> Ready for review (may need Approve)`);
            }

            console.log(`  -> Unknown/Skipped`);
            skipped++;

        } catch (e: any) {
            console.log(`  -> Error: ${e.message.substring(0, 50)}`);
            errors++;
        }

        await new Promise(r => setTimeout(r, 1000));
    }

    console.log(`\n=== DONE: Published=${published} Skipped=${skipped} Errors=${errors} ===`);
    await page.close();
    browser.disconnect();
}

main().catch(console.error);
