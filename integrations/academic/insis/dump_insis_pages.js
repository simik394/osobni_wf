const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
    try {
        const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
        let targetPage;
        for (const context of browser.contexts()) {
            for (const page of context.pages()) {
                if (page.url().includes('insis.vse.cz')) {
                    targetPage = page;
                    break;
                }
            }
        }
        
        if (targetPage) {
            console.log("Using existing page:", targetPage.url());
            
            // Navigate to Student portal explicitly if not there
            if (!targetPage.url().includes('student')) {
                console.log("Navigating to student portal...");
                await targetPage.goto('https://insis.vse.cz/auth/student/index.pl', { waitUntil: 'domcontentloaded' });
                await targetPage.waitForTimeout(2000);
            }
            
            const html = await targetPage.content();
            fs.writeFileSync('insis_portal_dump.html', html, 'utf8');
            console.log("Saved insis_portal_dump.html");
            
            // Look for links to Extract
            const links = await targetPage.evaluate(() => {
                const res = [];
                document.querySelectorAll('a').forEach(a => {
                    const txt = a.innerText.trim().toLowerCase();
                    if (txt.includes('rozvrh') || txt.includes('odevzd') || txt.includes('zkouš') || txt.includes('sylab') || txt.includes('předmět') || txt.includes('moje studium')) {
                        res.push({ text: a.innerText.trim(), href: a.href });
                    }
                });
                return res;
            });
            console.log("Interesting Links:");
            console.table(links);

        } else {
            console.log("No insis page found.");
        }
        await browser.close();
    } catch (e) {
        console.error(e);
    }
})();
