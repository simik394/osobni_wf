const { chromium } = require('playwright');
const fs = require('fs');
const { ensureAuthenticated } = require('./insis_auth_guard');
const Extractor = require('./insis_data_extractors');

(async () => {
    let browser, context, page;
    try {
        console.log("Connecting to browser at http://127.0.0.1:9222...");
        browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
        
        context = browser.contexts()[0];
        page = await context.newPage();

        console.log("Navigating to InSIS student portal...");
        await page.goto('https://insis.vse.cz/auth/', { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(2000);

        await ensureAuthenticated(page);
        console.log("✅ Authentication verified successfully.");

        // We fetch the main portal HTML using script evaluation and node fetching
        console.log("\n-> Fetching Dropboxes (Odevzdávárny)...");
        await page.goto('https://insis.vse.cz/auth/student/odevzdavarny.pl?studium=250444;obdobi=1187', { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(2000);
        const dropboxesHtml = await page.content();
        const dropboxes = Extractor.extractDropboxes(dropboxesHtml);
        fs.writeFileSync('insis_dropboxes.json', JSON.stringify(dropboxes, null, 2));
        console.log(`Saved ${dropboxes.length} Dropboxes to insis_dropboxes.json`);

        console.log("\n-> Fetching Exams (Termíny zkoušek)...");
        await page.goto('https://insis.vse.cz/auth/student/terminy_seznam.pl?studium=250444;obdobi=1187', { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(2000);
        const examsHtml = await page.content();
        const exams = Extractor.extractExams(examsHtml);
        fs.writeFileSync('insis_exams.json', JSON.stringify(exams, null, 2));
        console.log(`Saved ${exams.length} Exams to insis_exams.json`);

        console.log("\n-> Fetching Schedule (Rozvrh)...");
        await page.goto('https://insis.vse.cz/auth/katalog/rozvrhy_view.pl?rozvrh_student_obec=1?zobraz=1;format=html;rozvrh_student=149348', { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(2000);
        const rozvrhHtml = await page.content();
        
        const subjects = Extractor.extractSyllabuses(rozvrhHtml, examsHtml);
        fs.writeFileSync('insis_subjects.json', JSON.stringify(subjects, null, 2));
        console.log(`Saved ${subjects.length} Subjects to insis_subjects.json`);

        console.log("\nFinished gracefully.");
    } catch (e) {
        console.error("Critical error:", e);
    } finally {
        if (page) await page.close();
        if (browser) await browser.close();
    }
})();
