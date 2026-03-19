const { chromium } = require('playwright');
const fs = require('fs');
const { ensureAuthenticated } = require('./insis_auth_guard');

(async () => {
    let browser;
    let backgroundPage;
    try {
        browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
        console.log("Connected to browser.");
        
        const context = browser.contexts()[0];
        backgroundPage = await context.newPage();

        console.log("Navigating to InSIS student portal in a new background tab...");
        await backgroundPage.goto('https://insis.vse.cz/auth/', { waitUntil: 'domcontentloaded' });
        await backgroundPage.waitForTimeout(2000);

        await ensureAuthenticated(backgroundPage);
        console.log("✅ Authentication verified successfully.");

        // We want to find dropboxes (odevzd), schedule/timetable (rozvrh), exams (zkouš) and the student portal
        const keywords = ['odevzd', 'rozvrh', 'sylab', 'zkouš', 'student', 'portál'];
        
        const getLinks = async (pg) => {
            return await pg.evaluate(() => {
                const arr = [];
                document.querySelectorAll('a').forEach(a => {
                    const t = a.innerText.toLowerCase().trim();
                    const title = (a.getAttribute('title') || '').toLowerCase().trim();
                    const textContent = (t || title).replace(/\n/g, ' ');
                    if (textContent || a.href) arr.push({ text: textContent, href: a.href });
                });
                return arr;
            });
        };

        let links = await getLinks(backgroundPage);
        let portalLink = links.find(l => l.text.includes("student") && (l.text.includes("portál") || l.text.includes("portal")));
        
        if (portalLink) {
            console.log("\nNavigating to Portál Studenta: " + portalLink.href);
            await backgroundPage.goto(portalLink.href, { waitUntil: 'domcontentloaded' });
            await backgroundPage.waitForTimeout(2000);
            
            links = await getLinks(backgroundPage);
            
            console.log("\nExtracting Odevzdávárny...");
            const odevzdThis = links.find(l => l.href.includes('odevzdavarny.pl'));
            if (odevzdThis) {
                await backgroundPage.goto(odevzdThis.href, { waitUntil: 'domcontentloaded' });
                await backgroundPage.waitForTimeout(2000);
                fs.writeFileSync('insis_odevzdavarny_dump.html', await backgroundPage.content(), 'utf8');
                console.log("Saved insis_odevzdavarny_dump.html");
                await backgroundPage.goBack();
                await backgroundPage.waitForTimeout(1000);
                links = await getLinks(backgroundPage);
            }

            console.log("\nExtracting Termíny zkoušek...");
            const zkouskyLink = links.find(l => l.href.includes('terminy_seznam.pl'));
            if (zkouskyLink) {
                await backgroundPage.goto(zkouskyLink.href, { waitUntil: 'domcontentloaded' });
                await backgroundPage.waitForTimeout(2000);
                fs.writeFileSync('insis_zkousky_dump.html', await backgroundPage.content(), 'utf8');
                console.log("Saved insis_zkousky_dump.html");
                await backgroundPage.goBack();
                await backgroundPage.waitForTimeout(1000);
                links = await getLinks(backgroundPage);
            }
            
            console.log("\nExtracting Osobní rozvrh...");
            const rozvrhLink = links.find(l => l.href.includes('rozvrhy_view.pl'));
            if (rozvrhLink) {
                await backgroundPage.goto(rozvrhLink.href, { waitUntil: 'domcontentloaded' });
                await backgroundPage.waitForTimeout(2000);
                fs.writeFileSync('insis_rozvrh_dump.html', await backgroundPage.content(), 'utf8');
                console.log("Saved insis_rozvrh_dump.html");
                await backgroundPage.goBack();
                await backgroundPage.waitForTimeout(1000);
            }
            
        } else {
            console.log("Could not find Student portal link.");
        }

    } catch (e) {
        console.error("Critical error:", e);
    } finally {
        if (backgroundPage) await backgroundPage.close();
        if (browser) await browser.close();
        console.log("Extraction complete.");
    }
})();
