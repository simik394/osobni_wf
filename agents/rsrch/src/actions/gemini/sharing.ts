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
