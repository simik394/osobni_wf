
import puppeteer, { Browser, Page } from 'puppeteer-core';
import axios from 'axios';

const unpublishedSessionIds = [
    "4324009622645823838", "18367360959580359516", "12360621475817501794",
    "7752837278626726060", "12835488654430331528", "7850615722096457171",
    "10336333082179132854", "7293179044466798087", "15947946832729600272",
    "14217855041591550383", "17482257641869508571", "15389827849667123636",
    "12416778741637543393", "14430169512414124969", "3878646098614812080",
    "860823857239633943", "8311064291463697240", "10028639388430742763",
    "15037393704460347235", "14421962158747993235", "8197127078735585618",
    "13617083191669218996", "2476909059949715834", "7452984589346160295",
    "11436059471647233324", "9409450807523804689", "5158685305511540484",
    "8120384878311508152", "6384360672231470378", "10558238909647649340",
    "14196839462649387149", "8466822155028745541", "10583355814277710015",
];

async function getConnection(): Promise<Browser> {
    const resp = await axios.get('http://127.0.0.1:9225/json/version');
    let wsUrl: string = resp.data.webSocketDebuggerUrl;
    wsUrl = wsUrl.replace('chromium:9223', '127.0.0.1:9225');
    return puppeteer.connect({ browserWSEndpoint: wsUrl, defaultViewport: null });
}

async function processSession(page: Page, id: string): Promise<string> {
    await page.goto(`https://jules.google.com/session/${id}`, {
        waitUntil: 'domcontentloaded',
        timeout: 30000
    });
    await new Promise(r => setTimeout(r, 4000));

    // Priority 1: Check for Publish PR
    const publishBtn = await page.$('::-p-text("Publish PR")');
    if (publishBtn) {
        await publishBtn.click();
        await new Promise(r => setTimeout(r, 5000));
        return 'Published (PR)';
    }

    // Priority 2: Check for Publish branch (for sessions that don't have Publish PR)
    const publishBranchBtn = await page.$('::-p-text("Publish branch")');
    if (publishBranchBtn) {
        await publishBranchBtn.click();
        await new Promise(r => setTimeout(r, 5000));
        return 'Published (branch)';
    }

    // Already has PR
    const viewPrBtn = await page.$('::-p-text("View PR")');
    if (viewPrBtn) return 'Already has PR';

    return 'No button';
}

async function main() {
    console.log(`=== ROBUST BATCH PUBLISH ===`);
    console.log(`Sessions to process: ${unpublishedSessionIds.length}`);

    let browser: Browser | null = null;
    let page: Page | null = null;
    let published = 0, skipped = 0, errors = 0;

    try {
        browser = await getConnection();
        console.log('Connected to browser');
        page = await browser.newPage();
        console.log('Page created');
    } catch (e: any) {
        console.error('Failed to connect:', e.message);
        process.exit(1);
    }

    for (let i = 0; i < unpublishedSessionIds.length; i++) {
        const id = unpublishedSessionIds[i];
        const progress = `[${i + 1}/${unpublishedSessionIds.length}]`;

        try {
            const result = await processSession(page!, id);
            console.log(`${progress} ${id}: ${result}`);

            if (result === 'Published') published++;
            else skipped++;

        } catch (e: any) {
            console.log(`${progress} ${id}: ERROR - ${e.message.substring(0, 50)}`);
            errors++;

            // Try to recover connection
            try {
                if (page) await page.close().catch(() => { });
                if (browser) browser.disconnect();

                console.log('  Reconnecting...');
                browser = await getConnection();
                page = await browser.newPage();
                console.log('  Reconnected');
            } catch (reconnectErr: any) {
                console.error('  Reconnect failed:', reconnectErr.message);
                break;
            }
        }
    }

    console.log(`\n=== FINAL RESULTS ===`);
    console.log(`Published: ${published}`);
    console.log(`Skipped: ${skipped}`);
    console.log(`Errors: ${errors}`);

    try {
        if (page) await page.close();
        if (browser) browser.disconnect();
    } catch (e) { }

    process.exit(0);
}

main();
