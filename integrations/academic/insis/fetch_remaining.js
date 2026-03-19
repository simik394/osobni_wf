const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
    let browser, page;
    try {
        browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
        console.log("Connected to browser.");
        
        page = await browser.contexts()[0].newPage();

        console.log("Fetching Exams...");
        await page.goto('https://insis.vse.cz/auth/student/terminy_seznam.pl?studium=250444;obdobi=1187', { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(2000);
        fs.writeFileSync('insis_zkousky_dump.html', await page.content(), 'utf8');

        console.log("Fetching Schedule...");
        await page.goto('https://insis.vse.cz/auth/katalog/rozvrhy_view.pl?rozvrh_student_obec=1?zobraz=1;format=html;rozvrh_student=149348;zpet=../student/moje_studium.pl?_m=3110,studium=250444,obdobi=1187', { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(2000);
        fs.writeFileSync('insis_rozvrh_dump.html', await page.content(), 'utf8');

        console.log("Done.");

    } catch (e) {
        console.error("Critical error:", e);
    } finally {
        if (page) await page.close();
        if (browser) await browser.close();
    }
})();
