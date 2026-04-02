
import { BrowserClient } from '../src/clients/base';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config();

async function main() {
    console.log('=== DEBUG GEM EDIT INSPECTION ===');
    const cdpEndpoint = process.env.BROWSER_CDP_ENDPOINT || 'http://100.73.45.27:9223';
    
    const client = new BrowserClient({
        cdpEndpoint: cdpEndpoint,
        verbose: true
    });

    try {
        await client.init();
        const gemini = await client.createGeminiClient();
        
        console.log(`[Debug] Navigating to Gem view: https://gemini.google.com/gem/2cafb204ae5c`);
        const page = await client.getTabPage('gemini');
        if (!page) throw new Error('No Gemini page found');

        await page.goto(`https://gemini.google.com/gem/2cafb204ae5c`);
        await page.waitForTimeout(5000);

        // Click the three-dot menu in the header
        // It often has an aria-label like "More options" or just the icon
        const moreMenu = page.locator('button[aria-label*="Více"], button[aria-label*="More"], mat-icon:has-text("more_vert")').first();
        if (await moreMenu.count() > 0) {
            console.log('[Debug] Found three-dot menu button. Clicking...');
            await moreMenu.click();
            await page.waitForTimeout(2000);

            // Take a screenshot of the menu
            const menuScreenshotPath = path.join(process.cwd(), 'data', `gem_more_menu.png`);
            await page.screenshot({ path: menuScreenshotPath });
            console.log(`[Debug] Menu screenshot saved to: ${menuScreenshotPath}`);

            // Look for "Edit" or "Upravit" in the menu
            const editOption = page.locator('button:has-text("Upravit"), [role="menuitem"]:has-text("Upravit"), button:has-text("Edit"), [role="menuitem"]:has-text("Edit")');
            if (await editOption.count() > 0) {
                console.log('[Debug] ✅ Found Edit option in menu!');
                await editOption.first().click();
                await page.waitForTimeout(3000);
            }
        }

        // If we reached edit page, take screenshot and dump HTML
        const currentUrl = page.url();
        console.log(`[Debug] Final URL: ${currentUrl}`);

        const finalScreenshotPath = path.join(process.cwd(), 'data', `gem_final_check.png`);
        await page.screenshot({ path: finalScreenshotPath });
        
        const html = await page.content();
        require('fs').writeFileSync(path.join(process.cwd(), 'data', 'gem_final_check.html'), html);

    } catch (error: any) {
        console.error('[Debug] Error:', error.message);
    } finally {
        await client.close();
    }
}

main().catch(console.error);
