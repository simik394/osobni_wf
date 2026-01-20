
import puppeteer from 'puppeteer-core';
import axios from 'axios';
import fs from 'fs';

// Session IDs extracted from Jules MCP - COMPLETED sessions with NULL pull_request
// These need to be published:
const unpublishedSessionIds = [
    // From MCP list - COMPLETED with outputs containing {pull_request: null}
    "4324009622645823838",
    "18367360959580359516",
    "12360621475817501794",
    "7752837278626726060",
    "12835488654430331528",
    "7850615722096457171",
    "10336333082179132854",
    "7293179044466798087",
    "15947946832729600272",
    "14217855041591550383",
    "17482257641869508571",
    "15389827849667123636",
    "12416778741637543393",
    "14430169512414124969",
    "3878646098614812080",
    "860823857239633943",
    "8311064291463697240",
    "10028639388430742763",
    "15037393704460347235",
    "14421962158747993235",
    "8197127078735585618",
    "13617083191669218996",
    "2476909059949715834",
    "7452984589346160295",
    "11436059471647233324",
    "9409450807523804689",
    "5158685305511540484",
    "8120384878311508152",
    "6384360672231470378",
    "10558238909647649340",
    // Additional IDs from the screenshot's "Needs review" list:
    "14196839462649387149",
    "8466822155028745541",
    "10583355814277710015",
];

async function main() {
    console.log("=== BATCH PUBLISH - Full Session List ===");
    console.log(`Processing ${unpublishedSessionIds.length} sessions`);

    const resp = await axios.get('http://127.0.0.1:9225/json/version');
    let wsUrl: string = resp.data.webSocketDebuggerUrl;
    wsUrl = wsUrl.replace('chromium:9223', '127.0.0.1:9225');
    console.log(`Connecting: ${wsUrl}`);

    const browser = await puppeteer.connect({
        browserWSEndpoint: wsUrl,
        defaultViewport: null,
    });

    const page = await browser.newPage();
    let published = 0, skipped = 0, errors = 0;

    for (const id of unpublishedSessionIds) {
        process.stdout.write(`[${id}] `);

        try {
            await page.goto(`https://jules.google.com/session/${id}`, {
                waitUntil: 'domcontentloaded',
                timeout: 30000
            });
            await new Promise(r => setTimeout(r, 4000));

            // Try to click Publish button using ::-p-text
            const publishBtn = await page.$('::-p-text("Publish PR")') || await page.$('::-p-text("Publish branch")');
            if (publishBtn) {
                await publishBtn.click();
                await new Promise(r => setTimeout(r, 5000));
                console.log('Published ✓');
                published++;
                continue;
            }

            // Check if already has PR
            const viewPrBtn = await page.$('::-p-text("View PR")');
            if (viewPrBtn) {
                console.log('Already has PR');
                skipped++;
                continue;
            }

            console.log('Skipped (no button)');
            skipped++;

        } catch (e: any) {
            console.log(`Error: ${e.message.substring(0, 40)}`);
            errors++;
        }
    }

    console.log(`\n=== DONE ===`);
    console.log(`Published: ${published}`);
    console.log(`Skipped: ${skipped}`);
    console.log(`Errors: ${errors}`);

    await page.close();
    browser.disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
