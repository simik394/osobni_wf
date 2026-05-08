import { UniversalContext, GeminiActionDeps } from '../types';

/**
 * Sets the active Gemini model/mode.
 */
export async function setModelAction(
    ctx: UniversalContext,
    deps: GeminiActionDeps,
    modelName: string
): Promise<boolean> {
    const { page, log } = ctx;
    const { selectors } = deps;

    log(`Setting Gemini model to: ${modelName}`);

    try {
        const trigger = page.locator(selectors.gemini.model.trigger).first();
        if (!await trigger.isVisible()) {
            log('Model selector trigger not found.', 'warn');
            return false;
        }

        await trigger.click();
        await page.waitForTimeout(500);

        const menu = page.locator(selectors.gemini.model.menu).first();
        await menu.waitFor({ state: 'visible', timeout: 5000 });

        // Map model names to selectors
        let itemSelector = '';
        const normalized = modelName.toLowerCase();
        
        if (normalized.includes('flash')) {
            itemSelector = selectors.gemini.model.flash;
        } else if (normalized.includes('thinking') || normalized.includes('myšlení')) {
            itemSelector = selectors.gemini.model.thinking;
        } else if (normalized.includes('pro')) {
            itemSelector = selectors.gemini.model.pro;
        } else if (normalized.includes('advanced')) {
            itemSelector = selectors.gemini.model.advanced;
        } else {
            // Try by text as fallback
            itemSelector = `[role="menuitem"]:has-text("${modelName}"), [role="option"]:has-text("${modelName}")`;
        }

        const item = page.locator(itemSelector).first();
        if (await item.isVisible()) {
            await item.click();
            log(`Model set to ${modelName}`);
            await page.waitForTimeout(1000);
            return true;
        }

        log(`Model option "${modelName}" not found in menu.`, 'warn');
        await page.keyboard.press('Escape');
        return false;
    } catch (e: any) {
        log(`Failed to set model: ${e.message}`, 'error');
        return false;
    }
}
