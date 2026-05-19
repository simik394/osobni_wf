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

    log(`Setting Gemini model/thinking configuration to: ${modelName}`);

    try {
        const normalized = modelName.toLowerCase();
        let modelSelected = false;

        // 1. Identify and select primary model if specified
        let itemSelector = '';
        if (normalized.includes('lite')) {
            itemSelector = selectors.gemini.model.lite;
        } else if (normalized.includes('2.5 flash') || (normalized.includes('flash') && !normalized.includes('lite'))) {
            itemSelector = selectors.gemini.model.flash;
        } else if (normalized.includes('pro')) {
            itemSelector = selectors.gemini.model.pro;
        } else if (normalized.includes('thinking') || normalized.includes('myšlení')) {
            itemSelector = selectors.gemini.model.thinking;
        } else if (normalized.includes('advanced')) {
            itemSelector = selectors.gemini.model.advanced;
        }

        if (itemSelector) {
            const trigger = page.locator(selectors.gemini.model.trigger).first();
            if (!await trigger.isVisible()) {
                log('Model selector trigger not found.', 'warn');
                return false;
            }

            await trigger.click();
            await page.waitForTimeout(500);

            const menu = page.locator(selectors.gemini.model.menu).first();
            await menu.waitFor({ state: 'visible', timeout: 5000 });

            const item = page.locator(itemSelector).first();
            if (await item.isVisible()) {
                await item.click();
                log(`Successfully selected base model matching "${modelName}"`);
                modelSelected = true;
                await page.waitForTimeout(1000); // Wait for menu to close and model to switch
            } else {
                log(`Model option selector "${itemSelector}" not found in menu.`, 'warn');
                await page.keyboard.press('Escape');
                await page.waitForTimeout(500);
            }
        }

        // 2. Identify and adjust Thinking Level if specified
        const wantExtended = normalized.includes('extended');
        const wantStandard = normalized.includes('standard') && !normalized.includes('extended');

        if (wantExtended || wantStandard) {
            log(`Adjusting thinking level to: ${wantExtended ? 'Extended' : 'Standard'}`);
            
            // Open the selector dropdown
            const trigger = page.locator(selectors.gemini.model.trigger).first();
            if (!await trigger.isVisible()) {
                log('Model selector trigger not found for adjusting thinking level.', 'warn');
                return modelSelected;
            }

            await trigger.click();
            await page.waitForTimeout(500);

            const menu = page.locator(selectors.gemini.model.menu).first();
            await menu.waitFor({ state: 'visible', timeout: 5000 });

            // Find thinking level section / trigger
            const lvlTrigger = page.locator(selectors.gemini.model.thinkingLevel).first();
            if (await lvlTrigger.isVisible()) {
                log('Expanding thinking level menu...');
                await lvlTrigger.click();
                await page.waitForTimeout(500);

                const levelOptSelector = wantExtended
                    ? selectors.gemini.model.thinkingExtended
                    : selectors.gemini.model.thinkingStandard;

                const levelOpt = page.locator(levelOptSelector).first();
                if (await levelOpt.isVisible()) {
                    await levelOpt.click();
                    log(`Thinking level successfully set to: ${wantExtended ? 'Extended' : 'Standard'}`);
                    await page.waitForTimeout(1000);
                    return true;
                } else {
                    log(`Thinking level option "${levelOptSelector}" not found or not visible.`, 'warn');
                    await page.keyboard.press('Escape');
                }
            } else {
                log('Thinking level controls ("Úroveň myšlení") not found in model menu. It might not be supported on this model.', 'warn');
                await page.keyboard.press('Escape');
            }
        }

        // If we selected a model but did not adjust thinking level, or if everything worked:
        if (modelSelected) {
            return true;
        }

        // If nothing was specifically matched, try a generic text fallback selection
        if (!itemSelector && !wantExtended && !wantStandard) {
            const trigger = page.locator(selectors.gemini.model.trigger).first();
            if (await trigger.isVisible()) {
                await trigger.click();
                await page.waitForTimeout(500);

                const fallbackSelector = `[role="menuitem"]:has-text("${modelName}"), [role="option"]:has-text("${modelName}")`;
                const item = page.locator(fallbackSelector).first();
                if (await item.isVisible()) {
                    await item.click();
                    log(`Model set to "${modelName}" via text fallback.`);
                    await page.waitForTimeout(1000);
                    return true;
                }
                await page.keyboard.press('Escape');
            }
        }

        log(`Failed to perform any model action matching "${modelName}".`, 'warn');
        return false;
    } catch (e: any) {
        log(`Failed to set model config: ${e.message}`, 'error');
        return false;
    }
}
