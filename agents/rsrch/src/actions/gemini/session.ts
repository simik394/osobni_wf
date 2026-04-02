import { UniversalContext, GeminiActionDeps } from '../types';

/**
 * Resets the current Gemini session to a new chat.
 * 
 * @param ctx UniversalContext containing page and logger
 * @param deps Dependencies including selectors
 */
export async function resetToNewChatAction(
    ctx: UniversalContext,
    deps: GeminiActionDeps
): Promise<void> {
    const { page, log } = ctx;
    const { selectors } = deps;

    log('Resetting to new chat...');

    const url = page.url();
    if (url === ctx.config.urls.gemini + '/app' || url === 'https://gemini.google.com/app/') {
        // Already on home, but might have state
    }

    if (deps.recycle) {
        log('Using centralized recycle() for reset...');
        await deps.recycle();
    } else {
        let clicked = false;
        const newChatBtn = page.locator(selectors.gemini.chat.newChat).first();
        if (await newChatBtn.isVisible().catch(() => false)) {
            log('Clicking New Chat...');
            await newChatBtn.click();
            clicked = true;
        }

        if (!clicked) {
            log('New Chat button not found, forcing navigation to /app', 'warn');
            await page.goto(ctx.config.urls.gemini + '/app');
        }
    }

    try {
        await page.waitForURL(ctx.config.urls.gemini + '/app', { timeout: 5000 }).catch(() => { });
        const input = page.locator('div[contenteditable="true"], textarea').first();
        await input.waitFor({ state: 'visible', timeout: 5000 });

        // Handle Deep Research toggle if active
        try {
            const toggleSelector = selectors.gemini.deepResearch.toggle || 'button:has-text("Deep Research")';
            const drToggle = page.locator(toggleSelector).first();
            if (await drToggle.isVisible({ timeout: 1000 }).catch(() => false)) {
                log('Deep Research mode detected active. Disabling...');
                const closeSelector = selectors.gemini.deepResearch.closeButton;
                let closeClicked = false;
                if (closeSelector) {
                    const closeBtn = page.locator(closeSelector).first();
                    if (await closeBtn.isVisible({ timeout: 500 }).catch(() => false)) {
                        await closeBtn.click();
                        closeClicked = true;
                    }
                }
                if (!closeClicked) {
                    await drToggle.click();
                }
                await page.waitForTimeout(500);
            }
        } catch (e) {
            // Ignore DR errors
        }
    } catch (e) {
        log('Wait for new chat state timed out', 'warn');
    }

    log('Reset complete.');
}

/**
 * Sets the Gemini model via UI interaction.
 * 
 * @param ctx UniversalContext
 * @param deps Dependencies
 * @param modelName Model identifier (e.g., "pro", "thinking", "flash")
 * @returns boolean indicating success
 */
export async function setModelAction(
    ctx: UniversalContext,
    deps: GeminiActionDeps,
    modelName: string
): Promise<boolean> {
    const { page, log } = ctx;
    const { selectors } = deps;

    log(`Switching model to: ${modelName}`);

    try {
        const triggers = [
            selectors.gemini.model.trigger,
            'button[aria-haspopup="menu"]',
            'button[aria-label*="Model"]',
            'button:has-text("Gemini")',
            '[data-test-id="model-selector-button"]'
        ];

        let triggerFound = false;
        for (const selector of triggers) {
            const el = page.locator(selector).first();
            if (await el.isVisible().catch(() => false)) {
                log(`Found model trigger via: ${selector}`);
                await el.click();
                triggerFound = true;
                break;
            }
        }

        if (!triggerFound) {
            const headerBadge = page.locator('chat-app-bar button, .model-selector-button').first();
            if (await headerBadge.isVisible()) {
                await headerBadge.click();
                triggerFound = true;
            } else {
                log('Model selector trigger not found', 'error');
                return false;
            }
        }

        await page.waitForTimeout(1000);

        const name = modelName.toLowerCase();
        let targetSelector = '';

        if (name.includes('flash') || name.includes('quick') || name.includes('rych')) {
            targetSelector = selectors.gemini.model.flash;
        } else if (name.includes('think') || name.includes('deep') || name.includes('mysl')) {
            targetSelector = selectors.gemini.model.thinking;
        } else if (name.includes('pro') || name.includes('advanced')) {
            targetSelector = selectors.gemini.model.pro;
        } else {
            log(`Unknown model nickname: ${modelName}, trying direct text match`, 'warn');
            targetSelector = `text="${modelName}"`;
        }

        const options = targetSelector.split('|').map(s => s.trim());
        let clicked = false;
        for (const opt of options) {
            const item = page.locator(opt).first();
            if (await item.isVisible().catch(() => false)) {
                log(`Clicking model option: ${opt}`);
                await item.click();
                clicked = true;
                break;
            }
        }

        if (!clicked) {
            log(`Could not find model option for: ${modelName}`, 'error');
            return false;
        }

        await page.waitForTimeout(1000);
        return true;
    } catch (e: any) {
        log(`Set model failed: ${e.message}`, 'error');
        return false;
    }
}
