const { connectToBrowser } = require('../../lib/browser');
(async () => {
    try {
        const { browser, context } = await connectToBrowser();
        const page = await context.newPage();
        await page.goto('https://moodle.vse.cz/my/', { waitUntil: 'networkidle' });
        
        const courses = await page.evaluate(() => {
            const links = Array.from(document.querySelectorAll('a[href*="/course/view.php?id="]'));
            return links.map(a => ({
                title: a.innerText || a.getAttribute('title') || '',
                url: a.href
            })).filter(c => c.title.includes('415'));
        });
        
        console.log("Found courses matching 415:", JSON.stringify(courses, null, 2));
        await page.close();
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
})();
