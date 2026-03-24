const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { connectToBrowser, smartGoto } = require('../../lib/browser');
const { sanitizePath, ensureDirSync, sleep } = require('../../lib/utils');
const { assertAuthenticated } = require('../../lib/auth');
const Extractor = require('./moodle_data_extractors');

const BASE_DIR = path.join(__dirname, 'moodle_downloads');
const TARGET_COURSES = ['414', '415']; 

async function extractZip(zipPath, targetDir) {
    try {
        console.log(`     Extracting ${zipPath} to ${targetDir}...`);
        execSync(`unzip -o -q "${zipPath}" -d "${targetDir}"`);
        fs.unlinkSync(zipPath);
        console.log(`     Extracted and removed ZIP.`);
    } catch (e) {
        console.error(`     Failed to extract ZIP ${zipPath}:`, e.message);
    }
}

(async () => {
    let browser, context;
    try {
        console.log("Connecting to browser...");
        ({ browser, context } = await connectToBrowser());
        
        const workPage = await context.newPage();

        console.log("Navigating to dashboard...");
        await smartGoto(workPage, 'https://moodle.vse.cz/my/', 2000);
        await assertAuthenticated(workPage, 'vse_moodle');

        // Find course links
        let courseLinks = await workPage.evaluate((targets) => {
            const links = [];
            document.querySelectorAll('a[href*="/course/view.php?id="]').forEach(a => {
                const title = a.innerText || a.getAttribute('title') || '';
                if (targets.some(t => title.includes(t)) && !links.find(l => l.url === a.href)) {
                    links.push({ url: a.href, title: title.trim() });
                }
            });
            return links;
        }, TARGET_COURSES);

        // Fallback if no courses found (might be on a different page now)
        if (courseLinks.length === 0) {
            console.log("No courses found via dashboard links, trying direct navigation fallbacks...");
            courseLinks = [
                { url: 'https://moodle.vse.cz/course/view.php?id=21750', title: '4IT415 Informační modelování organizací (2025/2026 LS)' },
                { url: 'https://moodle.vse.cz/course/view.php?id=21125', title: '4IT414 Řízení projektů IS/ICT (2025/2026 LS)' }
            ];
        }

        console.log(`Found ${courseLinks.length} total target courses.`);

        const courseFilterIndex = process.argv.indexOf('--course');
        if (courseFilterIndex > -1 && process.argv.length > courseFilterIndex + 1) {
            const filter = process.argv[courseFilterIndex + 1];
            courseLinks = courseLinks.filter(c => c.title.includes(filter) || c.url.includes(filter));
            console.log(`Filtered to ${courseLinks.length} courses matching "${filter}".`);
        }

        for (const course of courseLinks) {
            const cleanCourseTitle = sanitizePath(course.title);
            console.log(`\n=== Processing Course: ${course.title} ===`);
            const courseDir = path.join(BASE_DIR, cleanCourseTitle);
            ensureDirSync(courseDir);

            await smartGoto(workPage, course.url, 2000);
            
            const courseHtml = await workPage.content();
            const modules = Extractor.extractModules(courseHtml);

            console.log(`Found ${modules.length} modules to process.`);

            const testLimitIndex = process.argv.indexOf('--limit');
            let limit = modules.length;
            if (testLimitIndex > -1 && process.argv.length > testLimitIndex + 1) {
                limit = parseInt(process.argv[testLimitIndex + 1], 10);
            }

            const isMapOnly = process.argv.includes('--map-only');
            if (isMapOnly) {
                fs.writeFileSync(path.join(courseDir, 'course_map.json'), JSON.stringify(modules, null, 2));
                continue;
            }

            const isDiff = process.argv.includes('--diff');
            const diffSummary = { new: [], existing: [], total: modules.length };

            for (let i = 0; i < Math.min(modules.length, limit); i++) {
                const mod = modules[i];
                try {
                    const cleanSecName = sanitizePath(mod.section);
                    const cleanModName = sanitizePath(mod.name);
                    const modDir = path.join(courseDir, cleanSecName);
                    
                    if (isDiff) {
                        let exists = false;
                        if (mod.type === 'folder') {
                            exists = fs.existsSync(path.join(modDir, cleanModName)) || fs.existsSync(path.join(modDir, `${cleanModName}.zip`));
                        } else if (mod.type === 'resource') {
                            const files = fs.existsSync(modDir) ? fs.readdirSync(modDir) : [];
                            exists = files.some(f => f.startsWith(cleanModName));
                        } else {
                            exists = fs.existsSync(path.join(modDir, `${cleanModName}.html`));
                        }

                        if (exists) {
                            diffSummary.existing.push(mod.name);
                        } else {
                            diffSummary.new.push(mod.name);
                            console.log(`  [NEW] ${mod.name} (${mod.type}) in ${mod.section}`);
                        }
                        continue;
                    }

                    ensureDirSync(modDir);
                    console.log(`  -> Processing [${mod.type}] ${mod.name}...`);
                    const randomDelay = Math.floor(500 + Math.random() * 500);
                    await smartGoto(workPage, mod.url, randomDelay);

                    const modHtml = await workPage.content();

                    if (mod.type === 'resource') {
                        let downloadUrl = Extractor.extractResourceLink(modHtml) || workPage.url();

                        try {
                            const res = await context.request.get(downloadUrl);
                            if (res.ok()) {
                                const header = res.headers()['content-disposition'];
                                let fileName = `${cleanModName}`;
                                if (header) {
                                    const match = header.match(/filename=\"?([^\"]+)\"?/);
                                    if (match && match[1]) fileName = match[1];
                                } else {
                                    const ct = res.headers()['content-type'] || '';
                                    if (ct.includes('pdf') && !fileName.endsWith('.pdf')) fileName += '.pdf';
                                    else if (ct.includes('document') && !fileName.includes('.')) fileName += '.docx';
                                }
                                fileName = sanitizePath(fileName);
                                const savePath = path.join(modDir, fileName);
                                
                                if (!fs.existsSync(savePath)) {
                                    fs.writeFileSync(savePath, await res.body());
                                    console.log(`     Saved file: ${fileName}`);
                                }
                            }
                        } catch (e) {
                            console.error(`     Error downloading resource:`, e.message);
                        }

                    } else if (mod.type === 'folder') {
                        const downloadBtnUrl = await workPage.evaluate(() => {
                            const btn = document.querySelector('form[action*="download_folder.php"]');
                            if (btn && btn.action) {
                                const inputs = Array.from(btn.querySelectorAll('input[type="hidden"]'));
                                const params = new URLSearchParams();
                                inputs.forEach(i => params.append(i.name, i.value));
                                return btn.action + '?' + params.toString();
                            }
                            return null;
                        });

                        if (downloadBtnUrl) {
                            try {
                                const res = await context.request.post(downloadBtnUrl.split('?')[0], {
                                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                                    data: downloadBtnUrl.split('?')[1]
                                });
                                
                                if (res.ok()) {
                                    const zipPath = path.join(modDir, `${cleanModName}.zip`);
                                    const targetDir = path.join(modDir, cleanModName);
                                    ensureDirSync(targetDir);
                                    fs.writeFileSync(zipPath, await res.body());
                                    await extractZip(zipPath, targetDir);
                                }
                            } catch (e) {}
                        } else {
                            // Fallback: search for direct file links
                            const fileLinks = Extractor.extractAttachments(modHtml);
                            for (const f of fileLinks) {
                                try {
                                    const res = await context.request.get(f.url);
                                    if (res.ok()) {
                                        const targetDir = path.join(modDir, cleanModName);
                                        ensureDirSync(targetDir);
                                        const fn = sanitizePath(f.text);
                                        const savePath = path.join(targetDir, fn);
                                        if (!fs.existsSync(savePath)) {
                                            fs.writeFileSync(savePath, await res.body());
                                        }
                                    }
                                } catch (e) {}
                                await sleep(500);
                            }
                        }
                    } else if (mod.type === 'book') {
                        const printUrl = Extractor.extractBookPrintLink(modHtml);
                        try {
                            if (printUrl) {
                                await smartGoto(workPage, printUrl, 1000);
                                const printHtml = await workPage.content();
                                const pageHtml = Extractor.extractMainContent(printHtml, mod.name);
                                fs.writeFileSync(path.join(modDir, cleanModName + '.html'), pageHtml, 'utf8');
                            } else {
                                const pageHtml = Extractor.extractMainContent(modHtml, mod.name);
                                fs.writeFileSync(path.join(modDir, cleanModName + '.html'), pageHtml, 'utf8');
                            }
                        } catch (e) {}
                    } else {
                        // Fallback (page, assign, etc.)
                        const pageHtml = Extractor.extractMainContent(modHtml, mod.name);
                        fs.writeFileSync(path.join(modDir, cleanModName + '.html'), pageHtml, 'utf8');

                        const attachments = Extractor.extractAttachments(modHtml);
                        for (const att of attachments) {
                            try {
                                const res = await context.request.get(att.url);
                                if (res.ok()) {
                                    let fileName = sanitizePath(att.text) || `attachment_${Date.now()}`;
                                    const savePath = path.join(modDir, cleanModName + '_' + fileName);
                                    if (!fs.existsSync(savePath)) {
                                        fs.writeFileSync(savePath, await res.body());
                                    }
                                }
                            } catch (e) {}
                        }
                    }
                } catch (err) {
                    console.error(`  !! Error processing module [${mod.name}]:`, err.message);
                }
            }

            if (isDiff) {
                console.log(`\n--- Diff Summary for ${course.title} ---`);
                console.log(`  Total Modules: ${diffSummary.total}`);
                console.log(`  Existing:      ${diffSummary.existing.length}`);
                console.log(`  New/Missing:   ${diffSummary.new.length}`);
                if (diffSummary.new.length === 0) console.log("  => Everything is up to date locally.");
                continue;
            }

            // Generate HTML Index
            if (!isMapOnly) {
                let indexHtml = `<!DOCTYPE html>\n<html>\n<head>\n<meta charset="utf-8">\n<title>${course.title}</title>\n`;
                indexHtml += `<style>\nbody{font-family:sans-serif;margin:2rem;max-width:900px;margin:auto;} \nul{list-style:none;padding-left:1.5rem;} \nli{margin:0.5rem 0;} \na{text-decoration:none;color:#0366d6;} \na:hover{text-decoration:underline;}\n</style>\n</head>\n<body>\n<h1>Kurz: ${course.title}</h1>\n`;
                
                let currentSec = '';
                for (let i = 0; i < Math.min(modules.length, limit); i++) {
                    const mod = modules[i];
                    if (mod.section !== currentSec) {
                        if (currentSec !== '') indexHtml += `</ul>\n`;
                        currentSec = mod.section;
                        indexHtml += `<h2>${currentSec}</h2>\n<ul>\n`;
                    }
                    const cleanSecName = sanitizePath(mod.section);
                    const cleanModName = sanitizePath(mod.name);
                    let localPath = path.join(cleanSecName, cleanModName + (['resource', 'folder'].includes(mod.type) ? '.pdf' : '.html')); 
                    if (mod.type === 'folder') localPath = path.join(cleanSecName, cleanModName);
                    indexHtml += `<li>${mod.type === 'folder' ? '📁' : '📄'} <a href="${localPath}" target="_blank">${mod.name}</a></li>\n`;
                }
                if (currentSec !== '') indexHtml += `</ul>\n`;
                indexHtml += `</body>\n</html>`;
                fs.writeFileSync(path.join(courseDir, 'index.html'), indexHtml, 'utf8');
            }
        }
    } catch (err) {
        console.error("Critical Error:", err);
    } finally {
        if (browser) await browser.close();
    }
})();

