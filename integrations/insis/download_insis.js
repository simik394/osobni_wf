const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// Skript byl upraven, aby nepoužíval UI klikání, které padalo na timeout, 
// ale aby přímo přes kontext prohlížeče (API) stahoval samotné soubory - čímž se
// problém se stahováním spolehlivě řeší.

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const BASE_DIR = path.join(__dirname, 'insis_downloads');

function sanitizeFilename(name) {
    if (!name) return 'downloaded_file';
    let decoded = decodeURIComponent(escape(name)); // zvládá diakritiku
    // Odstranění nepovolených znaků pro filenames na různých OS
    return decoded.replace(/[\\/:*?"<>|\r\n]+/g, '_').trim();
}

(async () => {
    try {
        console.log("Connecting to browser at 127.0.0.1:9222...");
        const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
        const context = browser.contexts()[0];

        let treePage = null;
        for (const page of context.pages()) {
            if (page.url().includes('dok_server')) {
                treePage = page;
                break;
            }
        }

        if (!treePage) {
            console.log("Could not find a page with 'dok_server' in URL.");
            await browser.close();
            return;
        }

        console.log("Found InSIS document tree page.");

        const foldersToDownload = await treePage.evaluate(() => {
            const results = [];
            const labels = document.querySelectorAll('div.node-label');

            function getPath(labelElement) {
                let pathArr = [];
                let currentContainer = labelElement.closest('.node-container');
                while (currentContainer) {
                    let labelNode = currentContainer.querySelector('.node-label a') || currentContainer.querySelector('.node-label');
                    if (labelNode) {
                        pathArr.unshift(labelNode.innerText.replace(/\(\s*\d+.*?\)/, '').trim());
                    }

                    let li = currentContainer.parentElement;
                    if (!li) break;
                    let ul = li.parentElement;
                    if (!ul) break;
                    let p = ul.parentElement;
                    if (p && p.classList.contains('subtree')) {
                        currentContainer = p.previousElementSibling;
                    } else {
                        currentContainer = null;
                    }
                }
                return pathArr;
            }

            for (let label of labels) {
                const text = label.innerText;
                const match = text.match(/\(\s*(\d+)\s*(?:\/\s*\d+\s*)?\)/);
                if (match && parseInt(match[1]) > 0) {
                    const a = label.querySelector('a');
                    if (a && a.href) {
                        let pathParts = getPath(label);
                        const cleanPath = pathParts.map(p => p.replace(/[\\/:*?"<>|\r\n]/g, '-').trim());

                        results.push({
                            url: a.href,
                            path: cleanPath,
                            numFiles: parseInt(match[1])
                        });
                    }
                }
            }
            return results;
        });

        console.log(`Found ${foldersToDownload.length} folders to process.`);

        const downloadPage = await context.newPage();

        for (let i = 0; i < foldersToDownload.length; i++) {
            const folder = foldersToDownload[i];
            const folderPath = path.join(BASE_DIR, ...folder.path);

            console.log(`[${i + 1}/${foldersToDownload.length}] Processing: ${folder.path.join(' / ')} (approx ${folder.numFiles} files)`);
            if (!fs.existsSync(folderPath)) {
                fs.mkdirSync(folderPath, { recursive: true });
            }

            await downloadPage.goto(folder.url, { waitUntil: 'domcontentloaded' });

            // Zkrácená pauza před čtením složky (0.5s - 1.5s)
            await sleep(500 + Math.random() * 1000);

            let hasNextPage = true;
            let pageNum = 1;

            while (hasNextPage) {
                console.log(`  -> Page ${pageNum}`);

                // Extract unique download links
                const downloadLinks = await downloadPage.evaluate(() => {
                    const anchors = Array.from(document.querySelectorAll('a[href*="download="]'));
                    return [...new Set(anchors.map(a => a.href))];
                });

                if (downloadLinks.length === 0) {
                    console.log("  -> No download links found on this page.");
                }

                for (let j = 0; j < downloadLinks.length; j++) {
                    const linkUrl = downloadLinks[j];
                    console.log(`  -> Downloading file ${j + 1}/${downloadLinks.length} ...`);

                    try {
                        const res = await context.request.get(linkUrl);
                        if (res.ok()) {
                            const header = res.headers()['content-disposition'];
                            let suggestedName = 'download_file_' + Date.now();
                            if (header) {
                                const match = header.match(/filename=\"?([^\"]+)\"?/);
                                if (match && match[1]) {
                                    suggestedName = match[1];
                                }
                            }
                            suggestedName = sanitizeFilename(suggestedName);

                            const savePath = path.join(folderPath, suggestedName);

                            if (!fs.existsSync(savePath)) {
                                const buffer = await res.body();
                                fs.writeFileSync(savePath, buffer);
                                console.log(`     Saved: ${suggestedName}`);
                            } else {
                                console.log(`     Skipped (already exists): ${suggestedName}`);
                            }
                        } else {
                            console.error(`     Failed Response: ${res.status()} for ${linkUrl}`);
                        }

                        // Zkrácená lidská pauza před stahováním dalšího souboru (1s - 2.5s)
                        await sleep(1000 + Math.random() * 1500);
                    } catch (e) {
                        console.error(`     Failed to download ${linkUrl}:`, e.message);
                    }
                }

                // Check for and navigate to next page if it exists
                const nextBtnXPath = 'a[title*="Další"], a[title*="Následující"], a[title*="Next"], a:has(img[alt*="Další"]), a:has(img[alt*="Následující"])';
                const nextBtnCount = await downloadPage.locator(nextBtnXPath).count();

                if (nextBtnCount > 0) {
                    console.log("  -> Navigating to next page...");
                    const nextBtn = downloadPage.locator(nextBtnXPath).first();
                    await Promise.all([
                        downloadPage.waitForNavigation({ waitUntil: 'domcontentloaded' }),
                        nextBtn.click()
                    ]);
                    pageNum++;
                    // Zkrácená pauza před zpracováním další stránky (1s - 2s)
                    await sleep(1000 + Math.random() * 1000);
                } else {
                    hasNextPage = false;
                }
            }
        }

        console.log("Finished all downloads.");
        await downloadPage.close();
        await browser.close();

    } catch (err) {
        console.error("Critical Error:", err);
    }
})();
