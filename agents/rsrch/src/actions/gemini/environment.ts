import { UniversalContext, GeminiActionDeps } from '../types';

/**
 * Toggles the Gemini Deep Research mode.
 * 
 * @param ctx UniversalContext
 * @param deps Dependencies
 * @param enabled Whether to enable or disable
 */
export async function toggleDeepResearchAction(
    ctx: UniversalContext,
    deps: GeminiActionDeps,
    enabled: boolean
): Promise<boolean> {
    const { page, log } = ctx;
    const { selectors } = deps;

    log(`${enabled ? 'Enabling' : 'Disabling'} Deep Research...`);

    try {
        const toolsBtn = page.locator(selectors.gemini.tools.trigger).first();
        if (!await toolsBtn.isVisible()) {
            log('Tools menu button not found', 'error');
            return false;
        }

        await toolsBtn.click();
        await page.waitForTimeout(500);

        const toggle = page.locator(selectors.gemini.tools.deepResearch).first();
        if (!await toggle.isVisible()) {
            log('Deep Research toggle not found in tools menu', 'error');
            await page.keyboard.press('Escape');
            return false;
        }

        const isPressed = await toggle.getAttribute('aria-pressed') === 'true' || 
                         await toggle.getAttribute('aria-checked') === 'true';

        if (isPressed !== enabled) {
            await toggle.click();
            await page.waitForTimeout(500);
            log(`Deep Research is now ${enabled ? 'ENABLED' : 'DISABLED'}`);
        } else {
            log(`Deep Research is already ${enabled ? 'enabled' : 'disabled'}`);
        }

        await page.keyboard.press('Escape');
        return true;
    } catch (e: any) {
        log(`Toggle Deep Research failed: ${e.message}`, 'error');
        return false;
    }
}

/**
 * Lists available Gemini extensions and their statuses.
 * 
 * @param ctx UniversalContext
 * @param deps Dependencies
 */
export async function listExtensionsAction(
    ctx: UniversalContext,
    deps: GeminiActionDeps
): Promise<Array<{ name: string; description?: string; enabled: boolean }>> {
    const { page, log } = ctx;
    const { selectors } = deps;

    log('Listing extensions...');

    try {
        // Navigate to connected apps
        await page.goto(ctx.config.urls.gemini + '/app/settings/connected-apps');
        await page.waitForSelector(selectors.gemini.settings.extensionItem, { timeout: 10000 });

        const items = page.locator(selectors.gemini.settings.extensionItem);
        const count = await items.count();
        const extensions = [];

        for (let i = 0; i < count; i++) {
            const item = items.nth(i);
            const name = await item.locator('.extension-name').innerText().catch(() => 'Unknown');
            const description = await item.locator('.extension-description').innerText().catch(() => '');
            
            const toggle = item.locator(selectors.gemini.settings.extensionToggle);
            const isChecked = await toggle.getAttribute('aria-checked') === 'true';

            extensions.push({ name, description, enabled: isChecked });
        }

        // Return to main app
        await page.goto(ctx.config.urls.gemini + '/app');

        return extensions;
    } catch (e: any) {
        log(`List extensions failed: ${e.message}`, 'error');
        return [];
    }
}

/**
 * Toggles a specific Gemini extension.
 * 
 * @param ctx UniversalContext
 * @param deps Dependencies
 * @param extensionName Name or partial name of the extension
 * @param enabled Target state
 */
export async function toggleExtensionAction(
    ctx: UniversalContext,
    deps: GeminiActionDeps,
    extensionName: string,
    enabled: boolean
): Promise<boolean> {
    const { page, log } = ctx;
    const { selectors } = deps;

    log(`${enabled ? 'Enabling' : 'Disabling'} extension: ${extensionName}...`);

    try {
        await page.goto(ctx.config.urls.gemini + '/app/settings/connected-apps');
        await page.waitForSelector(selectors.gemini.settings.extensionItem, { timeout: 10000 });

        const items = page.locator(selectors.gemini.settings.extensionItem);
        const count = await items.count();
        let targetItem = null;

        for (let i = 0; i < count; i++) {
            const item = items.nth(i);
            const name = await item.locator('.extension-name').innerText().catch(() => '');
            if (name.toLowerCase().includes(extensionName.toLowerCase())) {
                targetItem = item;
                break;
            }
        }

        if (!targetItem) {
            log(`Extension "${extensionName}" not found`, 'error');
            await page.goto(ctx.config.urls.gemini + '/app');
            return false;
        }

        const toggle = targetItem.locator(selectors.gemini.settings.extensionToggle);
        const isChecked = await toggle.getAttribute('aria-checked') === 'true';

        if (isChecked !== enabled) {
            await toggle.click();
            await page.waitForTimeout(1000);
            log(`Extension "${extensionName}" is now ${enabled ? 'ENABLED' : 'DISABLED'}`);
        } else {
            log(`Extension "${extensionName}" is already ${enabled ? 'enabled' : 'disabled'}`);
        }

        await page.goto(ctx.config.urls.gemini + '/app');
        return true;
    } catch (e: any) {
        log(`Toggle extension failed: ${e.message}`, 'error');
        await page.goto(ctx.config.urls.gemini + '/app').catch(() => {});
        return false;
    }
}
