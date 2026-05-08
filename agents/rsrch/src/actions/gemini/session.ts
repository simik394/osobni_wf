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
/**
 * Lists the current user's Gemini sessions/conversations.
 * Optimized for efficiency with search and pinned chat support.
 */
export async function listSessionsAction(
    ctx: UniversalContext,
    deps: GeminiActionDeps,
    options: { limit?: number, offset?: number, query?: string, pinnedOnly?: boolean } = {}
): Promise<{ name: string; id: string | null; pinned: boolean }[]> {
    const { page, log } = ctx;
    const { selectors } = deps;
    const { limit = 50, offset = 0, query, pinnedOnly } = options;

    log(`Listing sessions (limit: ${limit}, offset: ${offset}, query: ${query || 'none'}, pinnedOnly: ${pinnedOnly})...`);

    try {
        await ensureSidebarAction(ctx, deps);

        // 1. If query is provided, use the UI search if possible
        if (query) {
            return await searchSessionsAction(ctx, deps, query, { limit, offset, pinnedOnly });
        }

        // 2. Otherwise, scan the sidebar efficiently
        let sessionItems = page.locator(selectors.gemini.sidebar.conversations);
        let count = await sessionItems.count();

        // Targeted scrolling: only scroll if we haven't reached the limit/offset
        const targetCount = offset + limit;
        let retries = 0;
        
        while (count < targetCount && retries < 3) {
            const lastItem = sessionItems.last();
            if (await lastItem.isVisible().catch(() => false)) {
                await lastItem.scrollIntoViewIfNeeded().catch(() => {});
                await page.waitForTimeout(800);
            }

            const showMore = page.locator(selectors.gemini.sidebar.showMore).first();
            if (await showMore.isVisible().catch(() => false)) {
                await showMore.click().catch(() => {});
                await page.waitForTimeout(800);
            }

            const newCount = await sessionItems.count();
            if (newCount === count) retries++;
            else {
                count = newCount;
                retries = 0;
            }
        }

        const sessions: { name: string; id: string | null; pinned: boolean }[] = [];
        const start = Math.min(offset, count);
        
        for (let i = start; i < count && sessions.length < limit; i++) {
            const item = sessionItems.nth(i);
            const name = (await item.innerText().catch(() => '')).split('\n')[0].trim();
            if (!name) continue;

            const pinnedSelector = selectors.gemini.sidebar.pinnedIndicator || 'mat-icon:has-text("keep")';
            const isPinned = (await item.locator(pinnedSelector).count() > 0) || 
                             (await item.getAttribute('aria-label').catch(() => '') || '').toLowerCase().includes('pinned');

            if (pinnedOnly && !isPinned) continue;

            let id: string | null = null;
            const href = await item.getAttribute('href').catch(() => null);
            if (href && href.includes('/app/')) {
                id = href.split('/app/')[1].split('?')[0];
            }

            sessions.push({ name, id, pinned: isPinned });
        }

        return sessions;
    } catch (e: any) {
        log(`Error listing sessions: ${e.message}`, 'error');
        return [];
    }
}

/**
 * Searches for sessions using the Gemini UI search functionality.
 * Much faster than manual scrolling for targeted lookups.
 */
export async function searchSessionsAction(
    ctx: UniversalContext,
    deps: GeminiActionDeps,
    query: string,
    options: { limit?: number, offset?: number, pinnedOnly?: boolean } = {}
): Promise<{ name: string; id: string | null; pinned: boolean }[]> {
    const { page, log } = ctx;
    const { selectors } = deps;
    const { limit = 20, pinnedOnly = false } = options;

    log(`Searching for sessions matching: "${query}"`);

    try {
        const searchToggle = selectors.gemini.sidebar.searchToggle || 'button[aria-label*="Search" i]';
        const searchInput = selectors.gemini.sidebar.searchInput || 'input.search-input';

        const toggle = page.locator(searchToggle).first();
        if (await toggle.isVisible()) {
            await toggle.click();
            await page.waitForTimeout(500);
        }

        const input = page.locator(searchInput).first();
        if (await input.isVisible()) {
            await input.fill(query);
            await page.waitForTimeout(1000); // Wait for results
        } else {
            log('Search input not found, falling back to local filtering', 'warn');
        }

        // Extract results
        const results: { name: string; id: string | null; pinned: boolean }[] = [];
        const items = page.locator(selectors.gemini.sidebar.conversations);
        const count = await items.count();

        for (let i = 0; i < count && results.length < limit; i++) {
            const item = items.nth(i);
            const name = (await item.innerText().catch(() => '')).split('\n')[0].trim();
            if (!name) continue;

            const pinnedSelector = selectors.gemini.sidebar.pinnedIndicator || 'mat-icon:has-text("keep")';
            const isPinned = await item.locator(pinnedSelector).count() > 0;
            if (pinnedOnly && !isPinned) continue;

            const href = await item.getAttribute('href').catch(() => null);
            const id = href && href.includes('/app/') ? href.split('/app/')[1].split('?')[0] : null;

            results.push({ name, id, pinned: isPinned });
        }

        // Close search if needed
        await page.keyboard.press('Escape');

        return results;
    } catch (e: any) {
        log(`Search failed: ${e.message}`, 'error');
        return [];
    }
}

/**
 * Checks the status of available Gemini models, detecting rate limits and reset times.
 * 
 * @param ctx UniversalContext
 * @param deps Dependencies
 * @returns Array of model statuses
 */
export async function checkModelStatusAction(
    ctx: UniversalContext,
    deps: GeminiActionDeps
): Promise<Array<{ id: string; name: string; info?: string; isLimited: boolean; resetTime?: string }>> {
    const { page, log } = ctx;
    const { selectors } = deps;

    log('Checking model statuses and rate limits...');

    try {
        const triggers = [
            selectors.gemini.model.trigger,
            'button[aria-haspopup="menu"]',
            'button[aria-label*="Model"]',
            'button:has-text("Gemini")',
            '[data-test-id="model-selector-button"]'
        ];

        let triggerBtn = null;
        for (const selector of triggers) {
            const el = page.locator(selector).first();
            if (await el.isVisible().catch(() => false)) {
                triggerBtn = el;
                break;
            }
        }

        if (!triggerBtn) {
            log('Model selector trigger not found', 'error');
            return [];
        }

        await triggerBtn.click();
        await page.waitForTimeout(1000);

        const menuItems = page.locator(selectors.gemini.model.item + ', [role="menuitem"], [role="option"]');
        const count = await menuItems.count();
        const results: Array<{ id: string; name: string; info?: string; isLimited: boolean; resetTime?: string }> = [];

        for (let i = 0; i < count; i++) {
            const item = menuItems.nth(i);
            const text = await item.innerText().catch(() => '');
            if (!text) continue;

            const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
            const name = lines[0];
            const subtext = lines.slice(1).join(' ');

            const isLimited = /limit|reset|vyčerpán|obnoví/i.test(text);
            let resetTime = undefined;

            // Extract reset time if present (e.g. "5. 5. 19:29" or "19:29")
            const timeMatch = text.match(/(\d{1,2}\.\s?\d{1,2}\.\s?)?(\d{1,2}:\d{2})/);
            if (timeMatch) {
                resetTime = timeMatch[0];
            }

            // Map UI name to internal ID
            let id = 'unknown';
            if (/flash|rychl/i.test(name)) id = 'flash';
            else if (/think|mysl/i.test(name)) id = 'thinking';
            else if (/pro|adv/i.test(name)) id = 'pro';

            results.push({
                id,
                name,
                info: subtext,
                isLimited,
                resetTime
            });
        }

        // Close menu (click trigger again or ESC)
        await page.keyboard.press('Escape');
        await page.waitForTimeout(500);

        log(`Detected model statuses: ${results.map(r => `${r.id}${r.isLimited ? ' (LIMITED)' : ''}`).join(', ')}`);
        return results;

    } catch (e: any) {
        log(`Check model status failed: ${e.message}`, 'error');
        return [];
    }
}
