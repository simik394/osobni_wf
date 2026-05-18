import { UniversalContext, GeminiActionDeps } from '../types';

/**
 * Generates a shareable public link for the current Gemini session.
 */
export async function shareSessionAction(
    ctx: UniversalContext,
    deps: GeminiActionDeps
): Promise<string | null> {
    const { page, log } = ctx;
    const { selectors } = deps;

    log('Generating share link for session...');

    try {
        // 1. Try the top-level share button first
        let shareBtn = page.locator(selectors.gemini.session.share).first();
        if (!await shareBtn.isVisible()) {
            // Try sidebar more menu
            const moreBtn = page.locator(selectors.gemini.session.moreMenu).first();
            if (await moreBtn.isVisible()) {
                await moreBtn.click();
                await page.waitForTimeout(500);
                shareBtn = page.locator(selectors.gemini.session.menuShare).first();
            }
        }

        if (!await shareBtn.isVisible()) {
            log('Share button not found.', 'warn');
            return null;
        }

        await shareBtn.click();
        
        // 2. Wait for the dialog and "Create link" or "Copy link"
        // Sometimes it first asks to "Create public link"
        const createBtn = page.locator('button:has-text("Vytvořit veřejný odkaz"), button:has-text("Create public link")').first();
        if (await createBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
            await createBtn.click();
            await page.waitForTimeout(1000);
        }

        const copyBtn = page.locator(selectors.gemini.session.copyLink).first();
        await copyBtn.waitFor({ state: 'visible', timeout: 10000 });
        
        // Use clipboard API if possible, or extract from element
        await copyBtn.click();
        
        // Try to find the link in the UI if clicking copy isn't enough to get it back
        const linkEl = page.locator('a.link-url, .public-link-text, [role="dialog"] input[readonly]').first();
        let link = null;
        if (await linkEl.isVisible()) {
            link = await linkEl.getAttribute('href') || await linkEl.inputValue() || await linkEl.innerText();
        }

        log(`Share link generated: ${link}`);
        await page.keyboard.press('Escape');
        return link;
    } catch (e: any) {
        log(`Failed to share session: ${e.message}`, 'error');
        return null;
    }
}

/**
 * Lists all active public shared links from the Gemini settings menu.
 * Navigates to `/app/settings/sharing` to extract links and dates,
 * then returns the page back to `/app`.
 */
export async function listSharedLinksAction(
    ctx: UniversalContext,
    deps: GeminiActionDeps
): Promise<Array<{ title: string; url: string; date?: string; id: string }>> {
    const { page, log } = ctx;
    const { selectors } = deps;

    log('Listing all active public sharing links...');

    try {
        await page.goto(ctx.config.urls.gemini + '/app/settings/sharing');
        await page.waitForTimeout(2000);

        const items = page.locator(selectors.gemini.settings.sharing.linksList);
        const count = await items.count();
        log(`Found ${count} public sharing links.`);

        const links = [];
        for (let i = 0; i < count; i++) {
            const item = items.nth(i);
            const title = await item.locator(selectors.gemini.settings.sharing.linkTitle).innerText().catch(() => 'Unknown Session');
            const url = await item.locator(selectors.gemini.settings.sharing.linkUrl).getAttribute('href').catch(() => '') || '';
            
            // Extract sharing ID from URL (e.g. https://gemini.google.com/share/some_id)
            const id = url ? url.split('/share/').pop() || '' : '';

            links.push({ title: title.trim(), url, id });
        }

        // Return to main app
        await page.goto(ctx.config.urls.gemini + '/app');
        return links;
    } catch (e: any) {
        log(`Failed to list shared links: ${e.message}`, 'error');
        await page.goto(ctx.config.urls.gemini + '/app').catch(() => {});
        return [];
    }
}

/**
 * Deletes a specific public shared link by ID or Session Title.
 */
export async function deleteSharedLinkAction(
    ctx: UniversalContext,
    deps: GeminiActionDeps,
    linkIdOrTitle: string
): Promise<boolean> {
    const { page, log } = ctx;
    const { selectors } = deps;

    log(`Deleting public shared link: "${linkIdOrTitle}"...`);

    try {
        await page.goto(ctx.config.urls.gemini + '/app/settings/sharing');
        await page.waitForTimeout(2000);

        const items = page.locator(selectors.gemini.settings.sharing.linksList);
        const count = await items.count();
        let targetItem = null;

        for (let i = 0; i < count; i++) {
            const item = items.nth(i);
            const title = await item.locator(selectors.gemini.settings.sharing.linkTitle).innerText().catch(() => '');
            const url = await item.locator(selectors.gemini.settings.sharing.linkUrl).getAttribute('href').catch(() => '') || '';
            const id = url ? url.split('/share/').pop() || '' : '';

            if (id === linkIdOrTitle || title.toLowerCase().includes(linkIdOrTitle.toLowerCase())) {
                targetItem = item;
                break;
            }
        }

        if (!targetItem) {
            log(`Shared link "${linkIdOrTitle}" not found.`, 'error');
            await page.goto(ctx.config.urls.gemini + '/app');
            return false;
        }

        // Click delete button
        const deleteBtn = targetItem.locator(selectors.gemini.settings.sharing.deleteButton).first();
        await deleteBtn.click();
        await page.waitForTimeout(1000);

        // Click confirm in the dialog
        const confirmBtn = page.locator(selectors.gemini.settings.sharing.confirmDelete).first();
        if (await confirmBtn.isVisible()) {
            await confirmBtn.click();
            await page.waitForTimeout(1500);
            log('Shared link successfully deleted.');
        } else {
            log('Confirm delete dialog button not found.', 'error');
            await page.goto(ctx.config.urls.gemini + '/app');
            return false;
        }

        await page.goto(ctx.config.urls.gemini + '/app');
        return true;
    } catch (e: any) {
        log(`Failed to delete shared link: ${e.message}`, 'error');
        await page.goto(ctx.config.urls.gemini + '/app').catch(() => {});
        return false;
    }
}

/**
 * Deletes all public shared links created in this Gemini account.
 */
export async function deleteAllSharedLinksAction(
    ctx: UniversalContext,
    deps: GeminiActionDeps
): Promise<boolean> {
    const { page, log } = ctx;
    const { selectors } = deps;

    log('Deleting ALL public shared links...');

    try {
        await page.goto(ctx.config.urls.gemini + '/app/settings/sharing');
        await page.waitForTimeout(2000);

        const deleteAllBtn = page.locator(selectors.gemini.settings.sharing.deleteAllButton).first();
        if (!await deleteAllBtn.isVisible()) {
            log('No shared links exist or "Delete all links" button not visible.', 'warn');
            await page.goto(ctx.config.urls.gemini + '/app');
            return true;
        }

        await deleteAllBtn.click();
        await page.waitForTimeout(1000);

        // Click confirm in the dialog
        const confirmBtn = page.locator(selectors.gemini.settings.sharing.confirmDelete).first();
        if (await confirmBtn.isVisible()) {
            await confirmBtn.click();
            await page.waitForTimeout(2000);
            log('All shared links deleted successfully.');
        } else {
            log('Confirm delete all dialog button not found.', 'error');
            await page.goto(ctx.config.urls.gemini + '/app');
            return false;
        }

        await page.goto(ctx.config.urls.gemini + '/app');
        return true;
    } catch (e: any) {
        log(`Failed to delete all shared links: ${e.message}`, 'error');
        await page.goto(ctx.config.urls.gemini + '/app').catch(() => {});
        return false;
    }
}
