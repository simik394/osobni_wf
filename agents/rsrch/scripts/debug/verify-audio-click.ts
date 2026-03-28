
import { PerplexityClient } from './client';

async function main() {
    const client = new PerplexityClient();
    await client.init();
    try {
        const nb = await client.createNotebookClient();
        console.log('Opening notebook...');
        await nb.openNotebook("The Evolution of Czech Scouting");

        // Access private page
        const page = (nb as any).page;
        await page.waitForTimeout(5000);

        // Find Analyza button
        const analyzaBtn = page.locator('button').filter({ hasText: /Analýza|Studio/i }).first();
        if (await analyzaBtn.isVisible()) {
            console.log('Clicking "Analýza/Studio" button...');
            await analyzaBtn.click();
            await page.waitForTimeout(3000);

            // Check for Audio stuff
            const audioTexts = await page.evaluate(() => {
                const body = document.body.innerText;
                const matches = [
                    'Audio', 'Overview', 'Přehled', 'Podcast', 'Generovat', 'Stáhnout', 'Play'
                ].filter(t => body.includes(t));
                return matches;
            });
            console.log('Found audio-related text after click:', audioTexts);

            // Dump new buttons/structure
            const analysis = await page.evaluate(() => {
                const buttons = Array.from(document.querySelectorAll('button, [role="button"]')).map((el: any) => ({
                    text: el.textContent?.trim()?.substring(0, 30),
                    label: el.getAttribute('aria-label'),
                    class: el.className
                })).filter((b: any) => b.text || b.label);
                return buttons.slice(0, 20);
            });
            console.log('Visible buttons after click:', JSON.stringify(analysis, null, 2));

            await page.screenshot({ path: 'debug_click_analyza.png' });
        } else {
            console.log('"Analýza" button not found.');
        }

    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}

main();
