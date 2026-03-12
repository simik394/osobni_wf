const { chromium } = require('playwright');
const fs = require('fs');
const execSync = require('child_process').execSync;
const path = require('path');
const http = require('http');

async function main() {
    let browser;
    try {
        // Fetch the webSocketDebuggerUrl from the HTTP endpoint before connecting
        const getDebuggerUrl = () => new Promise((resolve, reject) => {
            http.get('http://localhost:9225/json/version', (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const json = JSON.parse(data);
                        // replace "chromium" hostname with "localhost" and correct port
                        resolve(json.webSocketDebuggerUrl.replace('ws://chromium:9223', 'ws://localhost:9225'));
                    } catch (e) { reject(e); }
                });
            }).on('error', reject);
        });

        // Use connect instead of connectOverCDP when we have the direct WS URL
        const wsUrl = await getDebuggerUrl();
        console.log("Connecting to:", wsUrl);
        browser = await chromium.connectOverCDP(wsUrl);
    } catch (e) {
        console.error("Could not connect to Chrome.", e);
        process.exit(1);
    }

    const contexts = browser.contexts();
    if (contexts.length === 0) {
        console.log("No browser contexts found.");
        process.exit(0);
    }

    // We will collect pages from all contexts
    const pages = [];
    for (const ctx of contexts) {
        pages.push(...ctx.pages());
    }
    console.log(`Found ${pages.length} open tabs.`);

    let groupedUrls = {};
    let totalImages = 0;

    for (const page of pages) {
        try {
            const url = page.url();
            // Match image URLs or specific domains where we know it's a gallery/image
            if (url.match(/\.(jpeg|jpg|gif|png|webp)(\?|$)/i) ||
                url.includes('rule34.xxx') ||
                url.includes('imgur.com') ||
                url.includes('twitter.com') ||
                url.includes('x.com') ||
                url.includes('pixiv.net')) {

                const urlObj = new URL(url);
                const domain = urlObj.hostname;
                if (!groupedUrls[domain]) {
                    groupedUrls[domain] = [];
                }
                groupedUrls[domain].push(url);
                totalImages++;
            }
        } catch (e) {
            // Ignore pages that we can't get URL from easily
        }
    }

    console.log(`Found ${totalImages} image tabs across ${Object.keys(groupedUrls).length} domains.`);

    if (totalImages === 0) {
        console.log("No images to download.");
        process.exit(0);
    }

    // Group images by domain
    for (const [domain, urls] of Object.entries(groupedUrls)) {
        console.log(`\nProcessing domain: ${domain} (${urls.length} images)`);

        // Pass urls to smart_download.sh
        const listFile = path.join('/tmp', `urls_${domain}_${Date.now()}.txt`);
        fs.writeFileSync(listFile, urls.join('\n'));

        const scriptPath = path.join(__dirname, 'smart_download.sh');
        try {
            console.log(`Downloading with smart_download.sh...`);
            const folderArg = `chrome_tabs_${Date.now()}/${domain.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
            execSync(`bash ${scriptPath} -q -i ${listFile} ${folderArg}`, { stdio: 'inherit' });
        } catch (e) {
            console.error(`Failed to download for ${domain}`, e.message);
        }
    }

    console.log(`\nFinished.`);
    // DO NOT CLOSE the browser, we are just attached to it
    await browser.disconnect();
}

main().catch(console.error);
