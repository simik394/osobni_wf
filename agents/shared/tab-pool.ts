/**
 * Tab Pool Management
 * 
 * Manages a pool of browser tabs for efficient reuse:
 * - Pre-loads tabs at startup (warm-up)
 * - Marks tabs as busy/free to prevent stealing
 * - Limits maximum tabs to prevent RAM exhaustion
 * - Recycles tabs via UI navigation (no page.goto())
 */

import type { Browser, Page, BrowserContext } from 'playwright';

// Configuration
export const MAX_TABS = 5;
const BUSY_FLAG = '__WINDMILL_BUSY';
const TAB_ID_FLAG = '__WINDMILL_TAB_ID';

// Service URLs for tab identification
export const SERVICE_URLS = {
    perplexity: 'https://www.perplexity.ai',
    gemini: 'https://gemini.google.com',
    angrav: 'chrome-extension://', // Angrav is an extension, URL pattern varies
} as const;

export type ServiceType = keyof typeof SERVICE_URLS;

/**
 * Generate a unique tab ID
 */
function generateTabId(): string {
    return `tab_${Date.now()}_${Math.random().toString(36).substring(7)}`;
}

/**
 * Mark a tab as busy (in use by a job)
 */
export async function markTabBusy(page: Page, jobId?: string): Promise<string> {
    const tabId = generateTabId();
    await page.evaluate(({ busy, tabId, jobId }) => {
        (window as any)[busy] = true;
        (window as any)[tabId] = tabId;
        (window as any).__WINDMILL_JOB_ID = jobId;
    }, { busy: BUSY_FLAG, tabId: TAB_ID_FLAG, jobId: jobId || tabId });

    console.log(`🔒 Tab ${tabId} marked as busy`);
    return tabId;
}

/**
 * Mark a tab as free (available for new jobs)
 */
export async function markTabFree(page: Page): Promise<void> {
    const tabId = await page.evaluate((flag) => (window as any)[flag], TAB_ID_FLAG);

    await page.evaluate((busy) => {
        (window as any)[busy] = false;
        (window as any).__WINDMILL_JOB_ID = null;
    }, BUSY_FLAG);

    console.log(`🔓 Tab ${tabId} marked as free`);
}

/**
 * Check if a tab is busy
 */
export async function isTabBusy(page: Page): Promise<boolean> {
    try {
        return await page.evaluate((flag) => (window as any)[flag] === true, BUSY_FLAG);
    } catch {
        // Page might be closed or navigating
        return true;
    }
}

/**
 * Get the tab ID stored in the page
 */
export async function getTabId(page: Page): Promise<string | null> {
    try {
        return await page.evaluate((flag) => (window as any)[flag] || null, TAB_ID_FLAG);
    } catch {
        return null;
    }
}

/**
 * Find a tab by its ID
 */
export async function findTabById(browser: Browser, tabId: string): Promise<Page | null> {
    const context = browser.contexts()[0];
    if (!context) return null;

    const pages = context.pages();

    for (const page of pages) {
        const pageTabId = await getTabId(page);
        if (pageTabId === tabId) {
            return page;
        }
    }

    return null;
}

/**
 * Find a free (not busy) tab for a specific service
 */
export async function findFreeTab(
    browser: Browser,
    service: ServiceType
): Promise<Page | null> {
    const context = browser.contexts()[0];
    if (!context) return null;

    const pages = context.pages();
    const serviceUrl = SERVICE_URLS[service];

    for (const page of pages) {
        try {
            const url = page.url();
            const isBusy = await isTabBusy(page);

            // Check if this tab is for the right service and is free
            if (url.includes(serviceUrl) && !isBusy) {
                console.log(`♻️ Found free tab for ${service}: ${url}`);
                return page;
            }
        } catch {
            // Page might be closed, skip
            continue;
        }
    }

    return null;
}

/**
 * Count current tabs for a service
 */
export async function countTabs(browser: Browser, service?: ServiceType): Promise<number> {
    const context = browser.contexts()[0];
    if (!context) return 0;

    const pages = context.pages();

    if (!service) return pages.length;

    const serviceUrl = SERVICE_URLS[service];
    return pages.filter(p => {
        try {
            return p.url().includes(serviceUrl);
        } catch {
            return false;
        }
    }).length;
}

/**
 * Get or create a tab for a service.
 * Respects MAX_TABS limit and prefers recycling.
 */
export async function getTab(
    browser: Browser,
    service: ServiceType,
    sessionId?: string
): Promise<Page> {
    const context = browser.contexts()[0] || await browser.newContext();
    const pages = context.pages();

    // 1. If looking for specific session, try to find it
    if (sessionId) {
        for (const page of pages) {
            if (page.url().includes(sessionId)) {
                const isBusy = await isTabBusy(page);
                if (!isBusy) {
                    console.log(`🎯 Found existing tab for session ${sessionId}`);
                    return page;
                }
                // Tab exists but is busy - we need to wait (Windmill queue handles this)
                throw new Error(`Tab for session ${sessionId} is busy`);
            }
        }
    }

    // 2. Find a free tab for this service
    const freeTab = await findFreeTab(browser, service);
    if (freeTab) {
        return freeTab;
    }

    // 3. Can we open a new tab?
    const totalTabs = pages.length;
    if (totalTabs < MAX_TABS) {
        console.log(`✨ Opening new tab (${totalTabs + 1}/${MAX_TABS})`);
        const newPage = await context.newPage();
        await newPage.goto(SERVICE_URLS[service]);
        return newPage;
    }

    // 4. Pool is full - throw error (Windmill will retry later)
    throw new Error(`BROWSER_FULL_CAPACITY: All ${MAX_TABS} tabs are busy`);
}

/**
 * Recycle a tab by navigating to "New Thread/Chat" via UI click
 * (avoids page.goto() which causes full reload)
 */
export async function recycleTab(page: Page, service: ServiceType): Promise<void> {
    await markTabFree(page);

    const url = page.url();

    if (service === 'perplexity') {
        // Click "New Thread" button or navigate to home
        const newThreadBtn = page.locator('button:has-text("New Thread"), a[href="/"]').first();
        if (await newThreadBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
            await newThreadBtn.click();
            await page.waitForURL('**/perplexity.ai/**', { timeout: 5000 }).catch(() => { });
        } else {
            // Fallback: clear the textarea if on homepage
            const textarea = page.locator('textarea').first();
            if (await textarea.isVisible({ timeout: 1000 }).catch(() => false)) {
                await textarea.fill('');
            }
        }
    } else if (service === 'gemini') {
        // Click "New chat" button
        const newChatBtn = page.locator('button:has-text("New chat")').first();
        if (await newChatBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
            await newChatBtn.click();
        }
    }

    console.log(`♻️ Tab recycled for ${service}`);
}

/**
 * Close excess tabs beyond MAX_TABS
 * Keeps the most recently used ones
 */
export async function pruneExcessTabs(browser: Browser): Promise<void> {
    const context = browser.contexts()[0];
    if (!context) return;

    const pages = context.pages();

    if (pages.length <= MAX_TABS) return;

    // Close oldest free tabs first
    const freeTabs: Page[] = [];
    for (const page of pages) {
        if (!(await isTabBusy(page))) {
            freeTabs.push(page);
        }
    }

    const toClose = freeTabs.slice(0, pages.length - MAX_TABS);
    for (const page of toClose) {
        console.log(`🗑️ Closing excess tab: ${page.url()}`);
        await page.close();
    }
}
