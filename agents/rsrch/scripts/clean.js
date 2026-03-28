const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.connectOverCDP('http://halvarm:9223');
    const contexts = browser.contexts();
    const page = contexts[0].pages().find(p => p.url().includes('notebooklm.google.com'));

    if (!page) {
        console.log("No NotebookLM page found.");
        process.exit(1);
    }

    console.log("Found NotebookLM page:", page.url());
    
    // Switch to sources tab if not active
    const sourcesTab = page.locator('div[role="tab"]').filter({ hasText: /Zdroje|Sources/i }).first();
    if (await sourcesTab.count() > 0) {
        await sourcesTab.click();
        await page.waitForTimeout(1000);
    }

    const moreBtns = page.locator('button').filter({ has: page.locator('mat-icon', { hasText: 'more_vert' }) });
    let count = await moreBtns.count();
    console.log("Found", count, "sources to delete.");

    while (count > 0) {
        console.log(`Deleting source, ${count} remaining...`);
        try {
            await moreBtns.nth(0).click();
            await page.waitForTimeout(1000);

            const deleteBtn = page.locator('button[role="menuitem"]').filter({ hasText: /Odstranit|Smazat|Remove|Delete/i }).first();
            if (await deleteBtn.count() > 0) {
                await deleteBtn.click();
                await page.waitForTimeout(1000);

                const confirmBtn = page.locator('mat-dialog-container button').filter({ hasText: /Odstranit|Smazat|Remove|Delete|vymazat/i }).first();
                if (await confirmBtn.count() > 0) {
                    await confirmBtn.click();
                    await page.waitForTimeout(3000);
                } else {
                    console.log("Wait, confirm button not found!");
                    console.log(await page.locator('mat-dialog-container').innerText());
                    
                    // Fallback to clicking the red warning button or last button
                    const lastBtn = page.locator('mat-dialog-container button').last();
                    await lastBtn.click();
                    await page.waitForTimeout(3000);
                }
            } else {
                console.log("Delete menu item not found!");
                // click away to close menu
                await page.mouse.click(0, 0);
                await page.waitForTimeout(500);
                break; // avoid infinite loop if broken
            }
        } catch(e) {
            console.log("Error during deletion loop:", e);
            break;
        }

        count = await moreBtns.count();
    }

    console.log("Cleanup complete.");
    await browser.close();
})();
