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
                
                sections.forEach(sec => {
                    const titleNode = sec.querySelector('a[data-for="section_title"]');
                    let sectionName = titleNode ? titleNode.textContent.trim() : 'Unknown Section';
                    
                    const links = sec.querySelectorAll('a[data-for="cm_name"]');
                    links.forEach(link => {
                        const url = link.href;
                        const name = link.textContent.trim();
                        let type = 'unknown';
                        if (url.includes('mod/resource')) type = 'resource'; // File
                        else if (url.includes('mod/folder')) type = 'folder'; // Folder
                        else if (url.includes('mod/assign')) type = 'assignment';
                        else if (url.includes('mod/page')) type = 'page';
                        else if (url.includes('mod/forum')) type = 'forum';
                        else if (url.includes('mod/url')) type = 'url';

                        results.push({
                            section: sectionName,
                            name: name,
                            type: type,
                            url: url
                        });
                    });
                });
                return results;
            });

            console.log(`Found ${modules.length} modules to process in this course.`);

            for (const mod of modules) {
                // We mainly care about resources (files) and folders for downloading documents.
                // Pages and assignments might have attachments, but let's cover the main ones first.
                if (mod.type === 'resource' || mod.type === 'folder' || mod.type === 'assign' || mod.type === 'page') {
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
                    } else if (mod.type === 'page' || mod.type === 'assign') {
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
