const fs = require('fs');
const { connectToBrowser, smartGoto } = require('../../lib/browser');
const { assertAuthenticated } = require('../../lib/auth');
const Extractor = require('./insis_data_extractors');

(async () => {
    let browser, context, page;
    try {
        console.log("Connecting to browser...");
        ({ browser, context } = await connectToBrowser());
        
        page = await context.newPage();

        console.log("Navigating to InSIS student portal...");
        await smartGoto(page, 'https://insis.vse.cz/auth/', 3000);

        await assertAuthenticated(page, 'vse_insis');
        console.log("✅ Authentication verified successfully.");

        // We fetch the main portal HTML using script evaluation and node fetching
        console.log("\n-> Fetching Dropboxes (Odevzdávárny)...");
        await smartGoto(page, 'https://insis.vse.cz/auth/student/odevzdavarny.pl?studium=250444;obdobi=1187', 1000 + Math.random() * 1000);
        const dropboxesHtml = await page.content();
        const dropboxes = Extractor.extractDropboxes(dropboxesHtml);

        console.log(`\n-> Fetching ${dropboxes.length} Detailed Dropbox Profiles...`);
        for (const dropbox of dropboxes) {
            if (dropbox.detailsLink) {
                let properLink = dropbox.detailsLink;
                if (!properLink.startsWith('http')) {
                    properLink = 'https://insis.vse.cz' + properLink;
                }
                
                await smartGoto(page, properLink, 500 + Math.random() * 500);
                const detailsHtml = await page.content();
                dropbox.details = Extractor.extractDropboxDetails(detailsHtml);
            }
        }

        fs.writeFileSync('insis_dropboxes.json', JSON.stringify(dropboxes, null, 2));
        console.log(`Saved ${dropboxes.length} Dropboxes to insis_dropboxes.json`);

        console.log("\n-> Fetching Exams (Termíny zkoušek)...");
        await smartGoto(page, 'https://insis.vse.cz/auth/student/terminy_seznam.pl?studium=250444;obdobi=1187', 1000 + Math.random() * 1000);
        const examsHtml = await page.content();
        const exams = Extractor.extractExams(examsHtml);
        fs.writeFileSync('insis_exams.json', JSON.stringify(exams, null, 2));
        console.log(`Saved ${exams.length} Exams to insis_exams.json`);

        console.log("\n-> Fetching Grades (Průběžná hodnocení)...");
        await smartGoto(page, 'https://insis.vse.cz/auth/student/list.pl?studium=250444;obdobi=1187', 1000 + Math.random() * 1000);
        const gradesHtml = await page.content();
        const grades = Extractor.extractGrades(gradesHtml);
        fs.writeFileSync('insis_grades.json', JSON.stringify(grades, null, 2));
        console.log(`Saved ${grades.length} Grade entries to insis_grades.json`);

        console.log("\n-> Fetching Schedule (Rozvrh)...");
        await smartGoto(page, 'https://insis.vse.cz/auth/katalog/rozvrhy_view.pl?rozvrh_student_obec=1?zobraz=1;format=html;rozvrh_student=149348', 1000 + Math.random() * 1000);
        const rozvrhHtml = await page.content();
        
        const anomalies = Extractor.extractAnomalies(rozvrhHtml);
        fs.writeFileSync('insis_schedule_anomalies.json', JSON.stringify(anomalies, null, 2));
        console.log(`Saved ${anomalies.length} Schedule Anomalies to insis_schedule_anomalies.json`);

        const subjects = Extractor.extractSyllabuses(rozvrhHtml, examsHtml);

        console.log(`\n-> Fetching ${subjects.length} Detailed Subject Profiles (Syllabuses)...`);
        const fullProfiles = [];
        for (const sub of subjects) {
            let properLink = sub.link;
            // Handle relative paths
            if (properLink.startsWith('.')) {
                // E.g "../katalog/syllabus.pl?predmet=215586"
                // E.g "./syllabus.pl?predmet=215931"
                properLink = new URL(properLink, 'https://insis.vse.cz/auth/katalog/rozvrhy_view.pl').href;
            } else if (!properLink.startsWith('http')) {
                properLink = 'https://insis.vse.cz' + properLink;
            }

            console.log(`Loading syllabus for ${sub.name}...`);
            await smartGoto(page, properLink, 500 + Math.random() * 1000);
            
            const syllabusHtml = await page.content();
            const details = Extractor.extractSyllabusDetails(syllabusHtml);
            fullProfiles.push({
                id: sub.id,
                name: sub.name,
                url: properLink,
                profile: details
            });
        }
        fs.writeFileSync('insis_subject_profiles.json', JSON.stringify(fullProfiles, null, 2));
        console.log(`Saved ${fullProfiles.length} Detailed Profiles to insis_subject_profiles.json`);

        console.log("\nFinished gracefully.");
    } catch (e) {
        console.error("Critical error:", e);
    } finally {
        if (page) await page.close();
        if (browser) await browser.close();
    }
})();
