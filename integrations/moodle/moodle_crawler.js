const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const BASE_DIR = path.join(__dirname, 'moodle_downloads');
const TARGET_COURSES = ['414', '415']; // We look for these in the course title

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function sanitizeFilename(name) {
    if (!name) return 'downloaded_file';
    return name.replace(/[\\/:*?"<>|\r\n]+/g, '_').trim();
}

async function extractZip(zipPath, targetDir) {
    try {
        console.log(`     Extracting ${zipPath} to ${targetDir}...`);
        // Using system unzip command for simplicity and robust handling
        execSync(`unzip -o -q "${zipPath}" -d "${targetDir}"`);
        fs.unlinkSync(zipPath); // Delete the zip file after extraction
        console.log(`     Extracted and removed ZIP.`);
    } catch (e) {
        console.error(`     Failed to extract ZIP ${zipPath}:`, e.message);
    }
}

(async () => {
    try {
        console.log("Connecting to browser at 127.0.0.1:9222...");
        const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
        const context = browser.contexts()[0];
        
        let targetPage = null;
        for (const page of context.pages()) {
            if (page.url().toLowerCase().includes('moodle.vse.cz')) {
                targetPage = page;
                break;
            }
        }
        
        if (!targetPage) {
            console.log("Could not find a Moodle page.");
            await browser.close();
            return;
        }

        console.log("Found Moodle page:", targetPage.url());
        
        // Find course links on the dashboard/overview
        const courseLinks = await targetPage.evaluate((targets) => {
            const links = [];
            document.querySelectorAll('a[href*="/course/view.php?id="]').forEach(a => {
                const title = a.innerText || a.getAttribute('title') || '';
                // Check if title contains any of our target courses
                if (targets.some(t => title.includes(t)) && !links.find(l => l.url === a.href)) {
                    links.push({ url: a.href, title: title.trim().replace(/[\\/:*?"<>|\r\n]+/g, '_') });
                }
            });
            return links;
        }, TARGET_COURSES);

        console.log(`Found ${courseLinks.length} target courses:`, courseLinks.map(c => c.title));

        const workPage = await context.newPage();

        for (const course of courseLinks) {
            console.log(`\n=== Processing Course: ${course.title} ===`);
            const courseDir = path.join(BASE_DIR, course.title);
            if (!fs.existsSync(courseDir)) {
                fs.mkdirSync(courseDir, { recursive: true });
            }

            await workPage.goto(course.url, { waitUntil: 'domcontentloaded' });
            await sleep(1500 + Math.random() * 1000);

            // Extract sections and modules via the left navigation tree (courseindex) which has everything loaded
            const modules = await workPage.evaluate(() => {
                const results = [];
                const sections = document.querySelectorAll('div.courseindex-section');
                
                sections.forEach((sec, index) => {
                    const titleEl = sec.querySelector('.courseindex-section-title a[data-for="section_title"]');
                    let sectionTitle = titleEl ? titleEl.textContent.trim() : `Section ${index + 1}`;
                    sectionTitle = sectionTitle.replace(/^\d+\.\s*/, '').trim(); 
                    
                    const moduleNodes = sec.querySelectorAll('li.courseindex-item');
                    for (const modElement of moduleNodes) {
                        const linkLabel = modElement.querySelector('a.courseindex-link');
                        if (!linkLabel) continue;
                        
                        const href = linkLabel.href;
                        // Skip anchor links on the main page like Labels
                        if (!href || href.includes('#')) continue;
                        
                        const title = linkLabel.textContent.trim();

                        let type = 'unknown';
                        if (href.includes('mod/resource')) type = 'resource';
                        else if (href.includes('mod/folder')) type = 'folder';
                        else if (href.includes('mod/page')) type = 'page';
                        else if (href.includes('mod/assign')) type = 'assign';
                        else if (href.includes('mod/turnitintooltwo')) type = 'turnitintooltwo';
                        else if (href.includes('mod/choicegroup')) type = 'choicegroup';
                        else if (href.includes('mod/feedback')) type = 'feedback';
                        else if (href.includes('mod/quiz')) type = 'quiz';
                        else if (href.includes('mod/book')) type = 'book';
                        else type = 'other';
                        
                        results.push({
                            section: sectionTitle,
                            name: title,
                            type: type,
                            url: href
                        });
                    }
                });
                return results;
            });

            console.log(`Found ${modules.length} modules to process in this course.`);

            const testLimitIndex = process.argv.indexOf('--limit');
            let limit = modules.length;
            if (testLimitIndex > -1 && process.argv.length > testLimitIndex + 1) {
                limit = parseInt(process.argv[testLimitIndex + 1], 10);
                console.log(`[TEST RUN] Limiting to first ${limit} modules.`);
            }

            const isMapOnly = process.argv.includes('--map-only');
            if (isMapOnly) {
                console.log(`[MAP ONLY] Exporting module map for ${course.title}...`);
                fs.writeFileSync(path.join(courseDir, 'course_map.json'), JSON.stringify(modules, null, 2));
                console.log(`     Saved map to course_map.json. Skipping downloads for this course.`);
                continue;
            }

            for (let i = 0; i < Math.min(modules.length, limit); i++) {
                const mod = modules[i];
                // we process everything now. unknown types fallback to HTML save.
                const supportedTypes = ['resource', 'folder', 'assign', 'page', 'book', 'turnitintooltwo', 'choicegroup', 'feedback', 'quiz', 'other', 'unknown'];
                if (supportedTypes.includes(mod.type)) {
                    const cleanSecName = sanitizeFilename(mod.section);
                    const cleanModName = sanitizeFilename(mod.name);
                    const modDir = path.join(courseDir, cleanSecName);
                    
                    if (!fs.existsSync(modDir)) {
                        fs.mkdirSync(modDir, { recursive: true });
                    }

                    console.log(`  -> Processing [${mod.type}] ${mod.name}...`);
                    
                    await workPage.goto(mod.url, { waitUntil: 'domcontentloaded' });
                    await sleep(1000 + Math.random() * 1000);

                    if (mod.type === 'resource') {
                        // Sometimes Moodle redirects directly to the file download, sometimes it shows a page with an object/iframe.
                        // If it redirects, the URL might not contain moodle.vse.cz/mod/resource anymore, but we can try to find download links.
                        const currentUrl = workPage.url();
                        let downloadUrl = currentUrl;

                        // Check if there's an explicit "click here to download" link or object data
                        const maybeDownloadLink = await workPage.evaluate(() => {
                            const resLink = document.querySelector('.resourceworkaround a');
                            if (resLink) return resLink.href;
                            const obj = document.querySelector('object[data]');
                            if (obj) return obj.getAttribute('data');
                            return null;
                        });

                        if (maybeDownloadLink) {
                            downloadUrl = maybeDownloadLink;
                        }

                        try {
                            const res = await context.request.get(downloadUrl);
                            if (res.ok()) {
                                const header = res.headers()['content-disposition'];
                                let fileName = `${cleanModName}`;
                                if (header) {
                                    const match = header.match(/filename=\"?([^\"]+)\"?/);
                                    if (match && match[1]) {
                                        fileName = match[1];
                                    }
                                } else {
                                    // Guess extension from content-type or URL
                                    const ct = res.headers()['content-type'] || '';
                                    if (ct.includes('pdf') && !fileName.endsWith('.pdf')) fileName += '.pdf';
                                    else if (ct.includes('document') && !fileName.includes('.')) fileName += '.docx';
                                }
                                fileName = sanitizeFilename(fileName);
                                const savePath = path.join(modDir, fileName);
                                
                                if (!fs.existsSync(savePath)) {
                                    const buffer = await res.body();
                                    fs.writeFileSync(savePath, buffer);
                                    console.log(`     Saved file: ${fileName}`);
                                } else {
                                    console.log(`     Skipped: ${fileName} (exists)`);
                                }
                            } else {
                                console.log(`     Failed to fetch resource: ${res.status()}`);
                            }
                        } catch (e) {
                            console.error(`     Error downloading resource:`, e.message);
                        }

                    } else if (mod.type === 'folder') {
                        // Look for "Download folder" button
                        const downloadBtnUrl = await workPage.evaluate(() => {
                            const btn = document.querySelector('form[action*="download_folder.php"]');
                            if (btn && btn.action) {
                                // sometimes it's a form post, sometimes a link
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
                                    headers: {
                                        'Content-Type': 'application/x-www-form-urlencoded'
                                    },
                                    data: downloadBtnUrl.split('?')[1]
                                });
                                
                                if (res.ok()) {
                                    const zipPath = path.join(modDir, `${cleanModName}.zip`);
                                    const targetDir = path.join(modDir, cleanModName); // extract into a subfolder named after the module
                                    
                                    if (!fs.existsSync(targetDir)) {
                                        fs.mkdirSync(targetDir, { recursive: true });
                                    }
                                    
                                    const buffer = await res.body();
                                    fs.writeFileSync(zipPath, buffer);
                                    console.log(`     Saved ZIP: ${cleanModName}.zip`);
                                    
                                    await extractZip(zipPath, targetDir);

                                } else {
                                     console.log(`     Failed to download folder ZIP: ${res.status()}`);
                                }
                            } catch (e) {
                                console.error(`     Error downloading folder:`, e.message);
                            }
                        } else {
                            console.log(`     No "Download folder" button found, deep crawling required (not fully implemented in this MVP).`);
                            // Fallback: search for direct file links within the folder
                            const fileLinks = await workPage.evaluate(() => {
                                const files = [];
                                document.querySelectorAll('.fp-filename-icon a').forEach(a => {
                                    files.push({ url: a.href, name: a.innerText });
                                });
                                return files;
                            });
                            for (const f of fileLinks) {
                                try {
                                    const res = await context.request.get(f.url);
                                    if (res.ok()) {
                                        const targetDir = path.join(modDir, cleanModName);
                                        if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
                                        const fn = sanitizeFilename(f.name);
                                        const savePath = path.join(targetDir, fn);
                                        if (!fs.existsSync(savePath)) {
                                            fs.writeFileSync(savePath, await res.body());
                                            console.log(`     Saved file from folder: ${fn}`);
                                        }
                                    }
                                } catch (e) {}
                                await sleep(500);
                            }
                        }
                    } else if (mod.type === 'book') {
                        // For books, try to fetch the "Print complete book" version which has all chapters in one HTML
                        const printUrl = await workPage.evaluate(() => {
                            const links = Array.from(document.querySelectorAll('a'));
                            const target = links.find(a => a.textContent.includes('Vytisknout celou knihu'));
                            if (target) return target.href;
                            
                            const printLinks = links.filter(a => a.href && a.href.includes('tool/print/index.php'));
                            if (printLinks.length > 0) {
                                const wholeBook = printLinks.find(a => !a.href.includes('chapterid'));
                                return wholeBook ? wholeBook.href : printLinks[0].href;
                            }
                            return null;
                        });

                        try {
                            if (printUrl) {
                                await workPage.goto(printUrl, { waitUntil: 'domcontentloaded' });
                                await sleep(1000);
                            }
                            
                            const pageHtml = await workPage.evaluate((title) => {
                                const mainRegion = document.querySelector('[role="main"]') || document.querySelector('#region-main') || document.body;
                                return `<!DOCTYPE html>\n<html>\n<head>\n<meta charset="UTF-8">\n<title>${title}</title>\n<style>body{font-family:sans-serif;line-height:1.6;padding:2rem;max-width:900px;margin:auto;} img{max-width:100%;height:auto;}</style>\n</head>\n<body>\n<h1>${title}</h1>\n<hr>\n${mainRegion.innerHTML}\n</body>\n</html>`;
                            }, mod.name);
                            
                            const htmlPath = path.join(modDir, cleanModName + '.html');
                            if (!fs.existsSync(htmlPath)) {
                                fs.writeFileSync(htmlPath, pageHtml, 'utf8');
                                console.log(`     Saved complete book HTML: ${cleanModName}.html`);
                            } else {
                                console.log(`     Skipped book HTML: ${cleanModName}.html (exists)`);
                            }
                        } catch (e) {
                            console.error(`     Error saving book HTML for ${mod.name}:`, e.message);
                        }
                    } else {
                        // Fallback for all other types (page, assign, turnitintooltwo, quiz, etc.):
                        // Save the page content itself as readable offline HTML
                        try {
                            const pageHtml = await workPage.evaluate((title) => {
                                const mainRegion = document.querySelector('[role="main"]') || document.querySelector('#region-main') || document.body;
                                // Basic cleanup of empty or UI-heavy spans if needed, but innerHTML is fine for now
                                return `<!DOCTYPE html>\n<html>\n<head>\n<meta charset="UTF-8">\n<title>${title}</title>\n<style>body{font-family:sans-serif;line-height:1.6;padding:2rem;max-width:900px;margin:auto;} img{max-width:100%;height:auto;}</style>\n</head>\n<body>\n<h1>${title}</h1>\n<hr>\n${mainRegion.innerHTML}\n</body>\n</html>`;
                            }, mod.name);
                            
                            const htmlPath = path.join(modDir, cleanModName + '.html');
                            if (!fs.existsSync(htmlPath)) {
                                fs.writeFileSync(htmlPath, pageHtml, 'utf8');
                                console.log(`     Saved page HTML: ${cleanModName}.html`);
                            }
                        } catch (e) {
                            console.error(`     Error saving page HTML for ${mod.name}:`, e.message);
                        }

                        // Look for attachments (pluginfile.php links)
                        const attachments = await workPage.evaluate(() => {
                            const atts = [];
                            document.querySelectorAll('a[href*="pluginfile.php"]').forEach(a => {
                                // Ignore pluginfile user avatars, etc. filter for mod_page/mod_assign
                                if (!a.href.includes('user/icon')) {
                                    atts.push({ url: a.href, text: a.innerText.trim() });
                                }
                            });
                            return atts;
                        });

                        if (attachments.length > 0) {
                            console.log(`     Found ${attachments.length} attachments.`);
                            for (const att of attachments) {
                                try {
                                    const res = await context.request.get(att.url);
                                    if (res.ok()) {
                                        let fileName = sanitizeFilename(att.text) || `attachment_${Date.now()}`;
                                        const savePath = path.join(modDir, cleanModName + '_' + fileName);
                                        if (!fs.existsSync(savePath)) {
                                            fs.writeFileSync(savePath, await res.body());
                                            console.log(`     Saved attachment: ${fileName}`);
                                        }
                                    }
                                } catch (e) {}
                                await sleep(500);
                            }
                        } else {
                            console.log(`     No attachments found.`);
                        }
                    }
                }
            }
        }

        console.log("Finished Moodle crawl.");
        await workPage.close();
        await browser.close();

    } catch (err) {
        console.error("Critical Error:", err);
    }
})();
