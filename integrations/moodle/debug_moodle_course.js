const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
    try {
        console.log("Connecting to browser at 127.0.0.1:9222...");
        const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
        const context = browser.contexts()[0];
        
        const workPage = await context.newPage();
        
        // Go directly to 414 or 415
        await workPage.goto('https://moodle.vse.cz/course/view.php?id=21125', { waitUntil: 'domcontentloaded' });
        
        // Wait a bit
        await new Promise(r => setTimeout(r, 2000));

        const html = await workPage.evaluate(() => document.body.innerHTML);
        fs.writeFileSync('moodle_course_dump.html', html);
        console.log("Saved Moodle course HTML to moodle_course_dump.html");

        await workPage.close();
        await browser.disconnect();
    } catch (err) {
        console.error("Error:", err);
    }
})();
