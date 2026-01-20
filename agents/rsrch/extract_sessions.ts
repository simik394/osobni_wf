
import puppeteer from 'puppeteer-core';
import axios from 'axios';
import fs from 'fs';

async function main() {
    console.log("=== Extract Session IDs from Open Browser ===");

    const resp = await axios.get('http://127.0.0.1:9225/json/version');
    let wsUrl: string = resp.data.webSocketDebuggerUrl;
    wsUrl = wsUrl.replace('chromium:9223', '127.0.0.1:9225');

    const browser = await puppeteer.connect({ browserWSEndpoint: wsUrl, defaultViewport: null });

    const pages = await browser.pages();
    console.log(`Open pages: ${pages.length}`);

    const allIds: string[] = [];

    for (const p of pages) {
        const url = p.url();
        if (url.includes('jules.google.com')) {
            console.log(`Processing page: ${url}`);

            // Scroll sidebar multiple times
            for (let i = 0; i < 30; i++) {
                await p.evaluate(() => {
                    const sidebar = document.querySelector('nav');
                    if (sidebar) sidebar.scrollTop += 300;
                });
                await new Promise(r => setTimeout(r, 100));
            }

            const ids = await p.evaluate(() => {
                const ids: string[] = [];
                document.querySelectorAll('a').forEach((a: any) => {
                    const href = a.getAttribute('href') || '';
                    const match = href.match(/\/session\/(\d+)/);
                    if (match && !ids.includes(match[1])) ids.push(match[1]);
                });
                return ids;
            });

            console.log(`Found ${ids.length} session IDs in this page`);
            allIds.push(...ids);
        }
    }

    const unique = [...new Set(allIds)];
    console.log(`\nTotal unique sessions: ${unique.length}`);

    // Save to file
    const sessions = unique.map(id => ({ id }));
    fs.writeFileSync('/tmp/fresh_sessions.json', JSON.stringify(sessions, null, 2));
    console.log('Saved to /tmp/fresh_sessions.json');

    browser.disconnect();
}

main().catch(console.error);
