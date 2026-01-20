
import puppeteer from 'puppeteer-core';
import axios from 'axios';
import fs from 'fs';

async function main() {
    console.log("=== TEST SINGLE SESSION (Containerized Browser) ===");

    // 1. Get WS URL from containerized browser (port 9225 maps to 9223 inside)
    const versionUrl = 'http://127.0.0.1:9225/json/version';
    const resp = await axios.get(versionUrl);

    // The response gives ws://chromium:9223/... but we need ws://127.0.0.1:9225/...
    let wsUrl: string = resp.data.webSocketDebuggerUrl;
    wsUrl = wsUrl.replace('chromium:9223', '127.0.0.1:9225');
    console.log(`Connecting to Containerized Browser: ${wsUrl}`);

    const browser = await puppeteer.connect({
        browserWSEndpoint: wsUrl,
        defaultViewport: null,
    });
    console.log("Connected.");

    // 2. Test with ONE session ID
    const testSessionId = '10336333082179132854'; // First session from the list
    const testUrl = `https://jules.google.com/session/${testSessionId}`;

    console.log(`Navigating to: ${testUrl}`);
    const page = await browser.newPage();
    await page.goto(testUrl, { waitUntil: 'domcontentloaded' });

    // Wait for UI (longer for container)
    await new Promise(r => setTimeout(r, 5000));

    // 3. Take a screenshot BEFORE clicking (proof of page state)
    await page.screenshot({ path: '/tmp/proof_before_click.png', fullPage: true });
    console.log("Screenshot saved: /tmp/proof_before_click.png");

    // 4. Shadow DOM piercing to find button
    const result = await page.evaluate(() => {
        const findButton = (node: any, texts: string[]): any => {
            if (!node) return null;
            if (node.tagName === 'BUTTON' || (node.getAttribute && node.getAttribute('role') === 'button') || node.tagName === 'A') {
                const nodeText = (node.innerText || node.getAttribute('aria-label') || '').toLowerCase();
                for (const t of texts) {
                    if (nodeText.includes(t.toLowerCase())) {
                        return { found: true, text: node.innerText };
                    }
                }
            }
            if (node.shadowRoot) {
                const res = findButton(node.shadowRoot, texts);
                if (res) return res;
            }
            if (node.childNodes) {
                for (const child of node.childNodes) {
                    const res = findButton(child, texts);
                    if (res) return res;
                }
            }
            return null;
        };

        return findButton(document.body, ['Publish PR', 'Publish branch', 'Approve', 'View PR', 'Update branch']);
    });

    console.log("Button search result:", result);

    // 5. Take a final screenshot
    await page.screenshot({ path: '/tmp/proof_final.png', fullPage: true });
    console.log("Final screenshot saved: /tmp/proof_final.png");

    // 6. Verify title
    const title = await page.title();
    console.log(`Page Title: ${title}`);

    await page.close();
    browser.disconnect();

    console.log("=== TEST COMPLETE ===");
    if (result && result.found) {
        console.log(`SUCCESS: Found button "${result.text}"`);
    } else {
        console.log("FAILURE: No target button found via Shadow DOM piercing.");
    }
}

main().catch(e => {
    console.error("Test failed with error:", e);
    process.exit(1);
});
