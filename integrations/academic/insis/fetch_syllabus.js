const fs = require('fs');
const { connectToBrowser, smartGoto } = require('../../lib/browser');
const { assertAuthenticated } = require('../../lib/auth');

(async () => {
    let browser, context, page;
    try {
        ({ browser, context } = await connectToBrowser());
        page = await context.newPage();
        await smartGoto(page, 'https://insis.vse.cz/auth/');
        await assertAuthenticated(page, 'vse_insis');
        await smartGoto(page, 'https://insis.vse.cz/auth/katalog/syllabus.pl?predmet=215406');
        const html = await page.content();
        fs.writeFileSync('_dumps/syllabus_215406.html', html);
        console.log('Saved to _dumps/syllabus_215406.html');
    } catch (e) {
        console.error(e);
    } finally {
        if (page) await page.close();
        if (browser) await browser.close();
    }
})();
