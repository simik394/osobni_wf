import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

(async () => {
    console.log("Connecting to remote browser on halvarm (100.73.45.27:9223)...");
    const browser = await chromium.connectOverCDP('http://100.73.45.27:9223');
    const context = browser.contexts()[0];
    const pages = context.pages();
    
    let page = pages.find(p => p.url().includes('notebooklm.google.com'));
    if (!page) {
        console.error("No NotebookLM page found!");
        await browser.close();
        return;
    }

    console.log(`Using page: ${page.url()}`);
    await page.bringToFront();

    await page.keyboard.press('Escape');
    await page.waitForTimeout(1000);

    const studioPanel = page.locator('section, .right-side-panel, .studio-panel').filter({ hasText: /Studio/i }).first();
    
    // Target the more_vert menu in the player bar at the bottom
    const playerMoreBtn = page.locator('.studio-panel button')
        .filter({ has: page.locator('mat-icon', { hasText: 'more_vert' }) })
        .filter({ 
            has: page.locator('xpath=../..//mat-icon[contains(text(), "thumb_up")] | ../..//mat-icon[contains(text(), "thumb_down")]') 
        })
        .first();

    if (await playerMoreBtn.count() > 0) {
        console.log("Found player menu. Intercepting download URL...");
        
        try {
            // 1. Kick off the download event listener
            const downloadPromise = page.waitForEvent('download', { timeout: 30000 });
            
            // 2. Trigger the menu and click "Download" via raw JS to be safe
            await page.evaluate((el: any) => {
                if (el) el.click();
                setTimeout(() => {
                    const selector = 'button[role="menuitem"], .mat-mdc-menu-item, .mat-menu-item, [role="menuitem"]';
                    const items = Array.from(document.querySelectorAll(selector));
                    const btn = items.find(b => b.textContent?.match(/Stáhnout|Download|Uložit|Save/i)) as HTMLElement;
                    if (btn) btn.click();
                }, 500);
            }, await playerMoreBtn.elementHandle());

            const download = await downloadPromise;
            const url = download.url();
            console.log(`\nURL captured: ${url.substring(0, 100)}...`);

            // 3. THE GOLDEN PATH: Use the browser context's request feature to download the file directly
            // This bypasses CDP filesystem issues and CORS because it's initiated by the browser context
            console.log("Downloading file directly via RequestContext bypass...");
            const response = await context.request.get(url);
            
            if (response.ok()) {
                const buffer = await response.body();
                const outputDir = path.resolve(process.cwd(), 'data', 'audio');
                if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
                const savePath = path.join(outputDir, 'architektura.m4a');
                
                fs.writeFileSync(savePath, buffer);
                console.log(`\n✨ SUCCESS! Audio downloaded to: ${savePath} (${buffer.length} bytes)`);
            } else {
                console.error(`Download failed with status: ${response.status()} ${response.statusText()}`);
            }
        } catch (e: any) {
            console.error(`Process failed: ${e.message}`);
            await page.screenshot({ path: 'data/golden_path_failed.png' });
        }
    } else {
        console.error("Player menu button not found.");
    }

    await browser.close();
})();
