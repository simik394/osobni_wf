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

/**
 * Ensures the sidebar is expanded for history/session access.
 */
export async function ensureSidebarAction(
    ctx: UniversalContext,
    deps: GeminiActionDeps
): Promise<void> {
    const { page, log } = ctx;
    const { selectors } = deps;

    // Check if sidebar container is visible
    const sidebar = page.locator('nav').first();
    const isVisible = await sidebar.isVisible().catch(() => false);

    if (!isVisible) {
        const menuButton = page.locator(selectors.gemini.sidebar.menu).first();
        if (await menuButton.count() > 0 && await menuButton.isVisible().catch(() => false)) {
            log('Expanding sidebar...');
            await menuButton.click();
            await page.waitForTimeout(1000); // Animation wait
        }
    }
}

/**
 * Lists the current user's Gemini sessions/conversations.
 * Handles infinite scroll and "Show more" logic.
 */
export async function listSessionsAction(
    ctx: UniversalContext,
    deps: GeminiActionDeps,
    options: { limit?: number, offset?: number } = {}
): Promise<{ name: string; id: string | null; pinned: boolean }[]> {
    const { page, log } = ctx;
    const { selectors } = deps;
    const { limit = 50, offset = 0 } = options;

    const sessions: { name: string; id: string | null; pinned: boolean }[] = [];
    
    try {
        // Ensure sidebar is visible
        await ensureSidebarAction(ctx, deps);

        // Wait for history loading spinner
        try {
            const spinner = page.locator('.loading-history-spinner-container');
            if (await spinner.count() > 0 && await spinner.isVisible().catch(() => false)) {
                await spinner.last().waitFor({ state: 'hidden', timeout: 5000 }).catch(() => { });
            }
        } catch (e) { /* Ignore */ }

        const targetCount = offset + limit;
        log(`Listing sessions (limit: ${limit}, offset: ${offset})...`);

        let sessionItems = page.locator(selectors.gemini.sidebar.conversations);
        let count = await sessionItems.count();

        // Scroll to load more if needed
        let retries = 0;
        while (count < targetCount && retries < 5) {
            const preCount = count;
            const lastItem = sessionItems.last();
            if (await lastItem.isVisible().catch(() => false)) {
                await lastItem.scrollIntoViewIfNeeded().catch(() => {});
                await page.waitForTimeout(1000); // Give time for infinite scroll
            }

            // Check if "show more" button exists (for deep history)
            const showMore = page.locator(selectors.gemini.sidebar.showMore).first();
            if (await showMore.isVisible().catch(() => false)) {
                await showMore.click().catch(() => {});
                await page.waitForTimeout(1000);
            }

            // Refresh selector count
            sessionItems = page.locator(selectors.gemini.sidebar.conversations);
            count = await sessionItems.count();

            if (count === preCount) {
                retries++;
            } else {
                retries = 0;
            }
        }

        // Define range to extract
        const start = Math.min(offset, count);
        const end = Math.min(offset + limit, count);

        if (start >= count) {
            return [];
        }

        for (let i = start; i < end; i++) {
            const item = sessionItems.nth(i);

            // 1. Get Name
            let name = await item.innerText().catch(() => '');
            name = name.split('\n')[0].trim();

            // 2. Get ID
            let id: string | null = null;

            // Method A: Check href
            const href = await item.getAttribute('href').catch(() => null);
            if (href && href.includes('/app/')) {
                id = href.split('/app/')[1];
            } else {
                const link = item.locator('a[href*="/app/"]').first();
                if (await link.count() > 0) {
                    const linkHref = await link.getAttribute('href');
                    if (linkHref) id = linkHref.split('/app/')[1];
                }
            }

            // Method B: jslog attribute (backup)
            if (!id) {
                const jslog = await item.getAttribute('jslog').catch(() => null);
                if (jslog) {
                    const match = jslog.match(/\["c_([a-zA-Z0-9]+)"/);
                    if (match) id = match[1];
                }
            }

            // Method C: data-id attribute
            if (!id) id = await item.getAttribute('data-id').catch(() => null);

            // 3. Check Pinned Status
            const hasPinIcon = await item.locator('svg path[d*="M16 9V4l1"]').count() > 0;
            const isPinned = hasPinIcon || (await item.getAttribute('aria-label') || '').toLowerCase().includes('pinned');

            if (name) {
                sessions.push({ name, id, pinned: isPinned });
            }
        }
    } catch (e: any) {
        log(`Error listing sessions: ${e.message}`, 'error');
    }

    log(`Found ${sessions.length} sessions`);
    return sessions;
}
