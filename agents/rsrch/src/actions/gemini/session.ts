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
                // Toggle it off
                await drToggle.click();
                await page.waitForTimeout(500);
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
    options: { 
        limit?: number, 
        offset?: number, 
        query?: string, 
        pinnedOnly?: boolean,
        strategy?: 'search' | 'scroll' | 'hybrid'
    } = {}
): Promise<{ name: string; id: string | null; pinned: boolean }[]> {
    const { page, log } = ctx;
    const { selectors } = deps;
    const { limit = 50, offset = 0, query, pinnedOnly, strategy = 'hybrid' } = options;

    log(`Listing sessions (limit: ${limit}, offset: ${offset}, query: ${query || 'none'}, pinnedOnly: ${pinnedOnly}, strategy: ${strategy})...`);

    try {
        await ensureSidebarAction(ctx, deps);

        let sessions: { name: string; id: string | null; pinned: boolean }[] = [];

        // 1. Search Strategy
        if (query && (strategy === 'search' || strategy === 'hybrid')) {
            sessions = await searchSessionsAction(ctx, deps, query, { limit, offset, pinnedOnly });
            
            if (sessions.length >= limit || strategy === 'search') {
                log(`Found ${sessions.length} sessions via search.`);
                return sessions;
            }
            log(`Search returned only ${sessions.length} sessions, falling back to scroll discovery...`);
        }

        // 2. Scroll Strategy (Fallback or primary)
        if (strategy === 'scroll' || strategy === 'hybrid') {
            const scrollResults = await discoverByScrollingAction(ctx, deps, { 
                limit, 
                offset, 
                query, 
                pinnedOnly,
                maxDepth: 200 // Max messages to scan via scrolling
            });
            
            // Merge results if we had search results
            if (sessions.length > 0) {
                const seenIds = new Set(sessions.map(s => s.id));
                for (const s of scrollResults) {
                    if (!seenIds.has(s.id)) {
                        sessions.push(s);
                    }
                }
                return sessions.slice(0, limit);
            }
            
            return scrollResults;
        }

        return sessions;
    } catch (e: any) {
        log(`Error listing sessions: ${e.message}`, 'error');
        return [];
    }
}

/**
 * High-speed discovery by scrolling the sidebar and scanning the DOM.
 */
async function discoverByScrollingAction(
    ctx: UniversalContext,
    deps: GeminiActionDeps,
    options: { limit: number, offset: number, query?: string, pinnedOnly?: boolean, maxDepth: number }
): Promise<{ name: string; id: string | null; pinned: boolean }[]> {
    const { page, log } = ctx;
    const { selectors } = deps;
    const { limit, offset, query, pinnedOnly, maxDepth } = options;

    log('Discovering sessions via rapid scroll...');

    const sessions: { name: string; id: string | null; pinned: boolean }[] = [];
    const seenIds = new Set<string>();

    const containerSelector = selectors.gemini.sidebar.container;
    const itemSelector = selectors.gemini.sidebar.conversations;

    let scannedCount = 0;
    let retries = 0;
    
    while (sessions.length < limit && scannedCount < maxDepth && retries < 5) {
        // Scan current view
        const items = page.locator(itemSelector);
        const count = await items.count();
        
        let foundNewInView = false;
        for (let i = 0; i < count; i++) {
            const item = items.nth(i);
            
            // Extract ID
            let id = await item.getAttribute('data-conversation-id').catch(() => null);
            if (!id) {
                const href = await item.getAttribute('href').catch(() => null);
                if (href && href.includes('/app/') && !href.includes('[object')) {
                    id = href.split('/app/')[1].split('?')[0];
                }
            }

            if (id && !seenIds.has(id)) {
                seenIds.add(id);
                scannedCount++;
                foundNewInView = true;

                // Extract Title
                const rawText = await item.textContent().catch(() => '');
                const name = (rawText || '').split('\n').map(l => l.trim()).find(l => l.length > 0) || 'Untitled Session';
                
                const pinnedSelector = selectors.gemini.sidebar.pinnedIndicator || 'mat-icon:has-text("keep")';
                const isPinned = (await item.locator(pinnedSelector).count() > 0);

                const matchesQuery = !query || name.toLowerCase().includes(query.toLowerCase());
                const matchesPinned = !pinnedOnly || isPinned;

                if (matchesQuery && matchesPinned) {
                    sessions.push({ name, id, pinned: isPinned });
                }
            }
        }

        if (sessions.length >= limit) break;

        // Scroll down
        const lastCount = count;
        if (count > 0) {
            await items.last().scrollIntoViewIfNeeded().catch(() => {});
        }
        await page.evaluate((sel) => {
            const container = document.querySelector(sel);
            if (container) container.scrollBy(0, 1000);
        }, containerSelector);
        
        await page.waitForTimeout(500);

        // Handle "Show more" button
        const showMore = page.locator(selectors.gemini.sidebar.showMore || 'button:has-text("Show more")').first();
        if (await showMore.isVisible().catch(() => false)) {
            await showMore.click().catch(() => {});
            await page.waitForTimeout(500);
        }

        const newCount = await items.count();
        if (!foundNewInView && newCount === lastCount) {
            retries++;
        } else {
            retries = 0;
        }
    }

    log(`Discovery complete. Scanned ${scannedCount} items, found ${sessions.length} matches.`);
    return sessions;
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
        const results = await page.locator(selectors.gemini.sidebar.conversations).all();
        const sessions: { name: string; id: string | null; pinned: boolean }[] = [];

        for (const item of results) {
            const name = (await item.innerText().catch(() => '')).split('\n')[0].trim();
            if (!name) continue;

            const pinnedSelector = selectors.gemini.sidebar.pinnedIndicator || 'mat-icon:has-text("keep")';
            const isPinned = (await item.locator(pinnedSelector).count() > 0);

            if (pinnedOnly && !isPinned) continue;

            let id: string | null = null;
            const href = await item.getAttribute('href').catch(() => null);
            if (href && href.includes('/app/')) {
                id = href.split('/app/')[1].split('?')[0];
            }

            sessions.push({ name, id, pinned: isPinned });
        }

        // Cleanup: clear search to restore sidebar
        if (await input.isVisible()) {
            await input.fill('');
            await page.waitForTimeout(3000); // UI needs time to reset
            await page.keyboard.press('Escape');
        }

        return sessions.slice(0, limit);
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
            const name = lines[0] || 'Unknown';
            const subtext = lines.slice(1).join(' ');

            // Skip dropdown section headers / help buttons
            if (/úroveň myšlení|thinking level|standard|extended/i.test(name)) {
                continue;
            }

            // Check if model is disabled or rate limited
            const ariaDisabled = await item.getAttribute('aria-disabled').catch(() => null);
            const disabledAttr = await item.getAttribute('disabled').catch(() => null);
            const hasDisabledClass = await item.evaluate((el) => {
                return el.classList.contains('disabled') || 
                       el.classList.contains('aria-disabled') || 
                       el.getAttribute('aria-disabled') === 'true';
            }).catch(() => false);

            const isInactive = ariaDisabled === 'true' || disabledAttr !== null || hasDisabledClass;
            const isLimited = isInactive || /limit|reset|vyčerpán|obnoví/i.test(text);
            let resetTime = undefined;

            // Extract reset time if present (e.g. "19. 5. 9:29" or "9:29")
            const timeMatch = text.match(/(\d{1,2}\.\s?\d{1,2}\.\s?)?(\d{1,2}:\d{2})/);
            if (timeMatch) {
                resetTime = timeMatch[0];
            }

            // Map UI name to internal ID
            let id = 'unknown';
            if (/flash-lite|lite/i.test(name)) id = 'lite';
            else if (/2\.5\s*flash/i.test(name)) id = 'flash';
            else if (/flash/i.test(name)) id = 'flash';
            else if (/3\.1\s*pro/i.test(name)) id = 'pro';
            else if (/pro/i.test(name)) id = 'pro';
            else if (/think|mysl/i.test(name)) id = 'thinking';

            // Avoid duplicate items
            if (id !== 'unknown' && results.some(r => r.id === id)) {
                continue;
            }

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
/**
 * Pins or unpins a session.
 * 
 * @param ctx UniversalContext
 * @param deps Dependencies
 * @param pin Whether to pin (true) or unpin (false)
 * @param sessionId Optional session ID (if not provided, uses current)
 */
export async function pinSessionAction(
    ctx: UniversalContext,
    deps: GeminiActionDeps,
    pin: boolean,
    sessionId?: string
): Promise<boolean> {
    const { page, log } = ctx;
    const { selectors } = deps;

    try {
        await ensureSidebarAction(ctx, deps);

        let targetItem = null;
        if (sessionId) {
            // Find session in sidebar
            const itemSelector = selectors.gemini.sidebar.conversations;
            const items = page.locator(itemSelector);
            const count = await items.count();
            
            for (let i = 0; i < count; i++) {
                const item = items.nth(i);
                const id = await item.getAttribute('data-conversation-id').catch(() => null);
                if (id === sessionId) {
                    targetItem = item;
                    break;
                }
            }
        } else {
            // Use currently active session
            targetItem = page.locator(selectors.gemini.sidebar.conversations + '.active').first();
        }

        if (!targetItem || await targetItem.count() === 0) {
            log('Could not find target session item in sidebar', 'error');
            return false;
        }

        // Hover to reveal more menu
        await targetItem.hover();
        
        const moreBtn = targetItem.locator('button[aria-label*="options"], button[aria-label*="akcí"]').first();
        if (await moreBtn.count() === 0 || !await moreBtn.isVisible()) {
            log('More options button not found for session', 'error');
            return false;
        }

        await moreBtn.click();
        await page.waitForTimeout(500);

        const pinSelector = pin ? selectors.gemini.session.pin : selectors.gemini.session.unpin;
        const pinBtn = page.locator(pinSelector).first();

        if (await pinBtn.isVisible()) {
            log(`${pin ? 'Pinning' : 'Unpinning'} session...`);
            await pinBtn.click();
            await page.waitForTimeout(1000);
            return true;
        } else {
            log(`${pin ? 'Pin' : 'Unpin'} option not found in menu (maybe already in target state?)`, 'warn');
            return false;
        }
    } catch (e: any) {
        log(`Pin/Unpin failed: ${e.message}`, 'error');
        return false;
    }
}

/**
 * Renames a Gemini session.
 * 
 * @param ctx UniversalContext
 * @param deps Dependencies
 * @param newName New title for the session
 * @param sessionId Optional session ID (if not provided, uses current)
 */
export async function renameSessionAction(
    ctx: UniversalContext,
    deps: GeminiActionDeps,
    newName: string,
    sessionId?: string
): Promise<boolean> {
    const { page, log } = ctx;
    const { selectors } = deps;

    try {
        await ensureSidebarAction(ctx, deps);

        let targetItem = null;
        if (sessionId) {
            const itemSelector = selectors.gemini.sidebar.conversations;
            const items = page.locator(itemSelector);
            const count = await items.count();
            for (let i = 0; i < count; i++) {
                const item = items.nth(i);
                if (await item.getAttribute('data-conversation-id') === sessionId) {
                    targetItem = item;
                    break;
                }
            }
        } else {
            targetItem = page.locator(selectors.gemini.sidebar.conversations + '.active').first();
        }

        if (!targetItem || await targetItem.count() === 0) {
            log('Could not find target session for rename', 'error');
            return false;
        }

        await targetItem.hover();
        const moreBtn = targetItem.locator(selectors.gemini.session.moreMenu).first();
        await moreBtn.click();
        await page.waitForTimeout(500);

        const renameBtn = page.locator(selectors.gemini.session.rename).first();
        if (await renameBtn.isVisible()) {
            await renameBtn.click();
            await page.waitForTimeout(500);

            const input = page.locator(selectors.gemini.session.renameInput).first();
            if (await input.isVisible()) {
                await input.fill(newName);
                await page.keyboard.press('Enter');
                await page.waitForTimeout(1000);
                log(`Session renamed to: ${newName}`);
                return true;
            }
        }

        log('Rename UI sequence failed', 'error');
        await page.keyboard.press('Escape');
        return false;
    } catch (e: any) {
        log(`Rename failed: ${e.message}`, 'error');
        return false;
    }
}

/**
 * Deletes a Gemini session.
 * 
 * @param ctx UniversalContext
 * @param deps Dependencies
 * @param sessionId Optional session ID (if not provided, uses current)
 */
export async function deleteSessionAction(
    ctx: UniversalContext,
    deps: GeminiActionDeps,
    sessionId?: string
): Promise<boolean> {
    const { page, log } = ctx;
    const { selectors } = deps;

    try {
        await ensureSidebarAction(ctx, deps);

        let targetItem = null;
        if (sessionId) {
            const itemSelector = selectors.gemini.sidebar.conversations;
            const items = page.locator(itemSelector);
            const count = await items.count();
            for (let i = 0; i < count; i++) {
                const item = items.nth(i);
                if (await item.getAttribute('data-conversation-id') === sessionId) {
                    targetItem = item;
                    break;
                }
            }
        } else {
            targetItem = page.locator(selectors.gemini.sidebar.conversations + '.active').first();
        }

        if (!targetItem || await targetItem.count() === 0) {
            log('Could not find target session for delete', 'error');
            return false;
        }

        await targetItem.hover();
        const moreBtn = targetItem.locator(selectors.gemini.session.moreMenu).first();
        await moreBtn.click();
        await page.waitForTimeout(500);

        const deleteBtn = page.locator(selectors.gemini.session.delete).first();
        if (await deleteBtn.isVisible()) {
            await deleteBtn.click();
            await page.waitForTimeout(1000);

            const confirmBtn = page.locator(selectors.gemini.session.confirmDelete).first();
            if (await confirmBtn.isVisible()) {
                await confirmBtn.click();
                await page.waitForTimeout(1000);
                log('Session deleted.');
                return true;
            }
        }

        log('Delete UI sequence failed', 'error');
        await page.keyboard.press('Escape');
        return false;
    } catch (e: any) {
        log(`Delete failed: ${e.message}`, 'error');
        return false;
    }
}
