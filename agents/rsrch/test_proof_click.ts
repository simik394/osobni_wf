
import puppeteer from 'puppeteer-core';
import axios from 'axios';

async function main() {
    console.log("=== PROOF: Click Publish PR and verify result ===");

    const versionUrl = 'http://127.0.0.1:9225/json/version';
    const resp = await axios.get(versionUrl);
    let wsUrl: string = resp.data.webSocketDebuggerUrl;
    wsUrl = wsUrl.replace('chromium:9223', '127.0.0.1:9225');
    console.log(`Connecting: ${wsUrl}`);

    const browser = await puppeteer.connect({
        browserWSEndpoint: wsUrl,
        defaultViewport: null,
    });

    const testSessionId = '10336333082179132854';
    const page = await browser.newPage();

    console.log(`Navigating to session: ${testSessionId}`);
    await page.goto(`https://jules.google.com/session/${testSessionId}`, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 4000)); // Wait for full load

    // Scroll to bottom to see the action buttons
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await new Promise(r => setTimeout(r, 1000));

    // Screenshot BEFORE click
    await page.screenshot({ path: '/tmp/proof_1_before_click.png', fullPage: true });
    console.log("Screenshot 1: Before click saved");

    // Find and click the button
    const clickResult = await page.evaluate(() => {
        const findButton = (node: any, texts: string[]): any => {
            if (!node) return null;
            if (node.tagName === 'BUTTON' || (node.getAttribute && node.getAttribute('role') === 'button')) {
                const nodeText = (node.innerText || node.getAttribute('aria-label') || '').toLowerCase();
                for (const t of texts) {
                    if (nodeText.includes(t.toLowerCase())) {
                        return node;
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

        const btn = findButton(document.body, ['Publish PR', 'Publish branch']);
        if (btn) {
            const text = btn.innerText;
            btn.click();
            return { clicked: true, buttonText: text };
        }

        // Check if already published
        const viewPr = findButton(document.body, ['View PR']);
        if (viewPr) {
            return { clicked: false, alreadyPublished: true, buttonText: viewPr.innerText };
        }

        return { clicked: false, notFound: true };
    });

    console.log("Click result:", clickResult);

    if (clickResult.clicked) {
        console.log("Waiting for publish to complete...");
        await new Promise(r => setTimeout(r, 6000)); // Wait for publish action

        // Screenshot AFTER click
        await page.screenshot({ path: '/tmp/proof_2_after_click.png', fullPage: true });
        console.log("Screenshot 2: After click saved");

        // Check for View PR button (indicates success)
        const verifyResult = await page.evaluate(() => {
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
            return findButton(document.body, ['View PR', 'Update branch']);
        });

        console.log("Verification:", verifyResult);

        if (verifyResult && verifyResult.found) {
            console.log("SUCCESS: Publish completed - 'View PR' button now visible");
        } else {
            console.log("UNCERTAIN: Click executed, but 'View PR' not detected. Check screenshot.");
        }
    } else if (clickResult.alreadyPublished) {
        console.log("Session already published - 'View PR' button present");
        await page.screenshot({ path: '/tmp/proof_2_already_published.png', fullPage: true });
    } else {
        console.log("FAILED: No Publish button found");
        await page.screenshot({ path: '/tmp/proof_2_no_button.png', fullPage: true });
    }

    await page.close();
    browser.disconnect();
    console.log("=== PROOF COMPLETE ===");
}

main().catch(console.error);
