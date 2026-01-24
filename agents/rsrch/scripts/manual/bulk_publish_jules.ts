
import puppeteer from 'puppeteer-core';
import axios from 'axios';
import fs from 'fs';

async function main() {
    console.log("Starting bulk publish script v5 (Shadow DOM + TS Fix)...");

    // 1. Get WS URL
    const versionUrl = 'http://127.0.0.1:9222/json/version';
    const resp = await axios.get(versionUrl);
    const wsUrl = resp.data.webSocketDebuggerUrl;
    console.log(`Connecting to Browser: ${wsUrl}`);

    const browser = await puppeteer.connect({
        browserWSEndpoint: wsUrl,
        defaultViewport: null,
    });

    // 2. Read Sessions
    const content = fs.readFileSync('/tmp/completed_sessions.json', 'utf8');
    const jsonStart = content.indexOf('[');
    const jsonStr = content.substring(jsonStart);
    const sessions = JSON.parse(jsonStr);

    console.log(`Found ${sessions.length} sessions to process.`);

    const page = await browser.newPage();
    console.log("Opened worker tab.");

    let publishedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    // Helper to find and click button in Shadow DOM
    const clickShadowButton = async (texts: string[]) => {
        return page.evaluate((texts) => {
            const findButton = (node: any, texts: any): any => {
                if (!node) return null;
                // Check current node
                if (node.tagName === 'BUTTON' || (node.getAttribute && node.getAttribute('role') === 'button') || node.tagName === 'A') {
                    const nodeText = (node.innerText || node.getAttribute('aria-label') || '').toLowerCase();
                    for (const t of texts) {
                        if (nodeText.includes(t.toLowerCase())) {
                            return node;
                        }
                    }
                }

                // Shadow Root
                if (node.shadowRoot) {
                    const res = findButton(node.shadowRoot, texts);
                    if (res) return res;
                }

                // Children
                if (node.childNodes) {
                    for (const child of node.childNodes) {
                        const res = findButton(child, texts);
                        if (res) return res;
                    }
                }

                return null;
            };

            const btn = findButton(document.body, texts);
            if (btn) {
                btn.click();
                return btn.innerText || 'clicked';
            }
            return null;
        }, texts);
    };

    for (const session of sessions) {
        const id = session.id;
        console.log(`[${id}] Processing...`);

        try {
            await page.goto(`https://jules.google.com/session/${id}`, { waitUntil: 'domcontentloaded' });
            await new Promise(r => setTimeout(r, 2000)); // Load

            // Try 1: Publish PR / Publish Branch
            let res = await clickShadowButton(['Publish PR', 'Publish branch']);
            if (res) {
                console.log(`  -> Clicked "${res}"`);
                await new Promise(r => setTimeout(r, 4000));
                publishedCount++;
                continue;
            }

            // Try 2: Approve
            // Note: The audit said "Approve" is missing, but "Publish PR" is there.
            // We keep "Approve" logic just in case.
            res = await clickShadowButton(['Approve']);
            if (res) {
                console.log(`  -> Clicked "${res}"`);
                await new Promise(r => setTimeout(r, 2000));
                const res2 = await clickShadowButton(['Publish PR', 'Publish branch']);
                if (res2) {
                    console.log(`  -> Clicked "${res2}" (after Approve)`);
                    await new Promise(r => setTimeout(r, 4000));
                }
                publishedCount++;
                continue;
            }

            // Try 3: Looks good
            res = await clickShadowButton(['Looks good']);
            if (res) {
                console.log(`  -> Clicked "${res}"`);
                await new Promise(r => setTimeout(r, 2000));
                const res2 = await clickShadowButton(['Publish PR', 'Publish branch']);
                if (res2) {
                    console.log(`  -> Clicked "${res2}" (after Looks good)`);
                    await new Promise(r => setTimeout(r, 4000));
                }
                publishedCount++;
                continue;
            }

            // Skip
            const title = await page.title();
            console.log(`  -> Unknown (Title: ${title}). No Shadow Button found.`);
            skippedCount++;

        } catch (e) {
            console.error(`  -> Error:`, e);
            errorCount++;
        }
        await new Promise(r => setTimeout(r, 500));
    }

    console.log(`Done. P:${publishedCount} S:${skippedCount} E:${errorCount}`);
    await page.close();
    browser.disconnect();
}

main().catch(console.error);
