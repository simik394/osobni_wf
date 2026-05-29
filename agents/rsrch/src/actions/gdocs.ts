import { UniversalContext, GDocsActionDeps } from './types';
import { withHumanHands } from '@agents/shared';

/**
 * Creates a new Google Doc and sets its title.
 */
export async function createGDocAction(ctx: UniversalContext, title: string): Promise<string | null> {
    const { page, log } = ctx;
    const selectors = ctx.config.selectors;
    
    log(`Creating new Google Doc: ${title}`);
    
    try {
        await withHumanHands(async () => {
            await page.goto('https://docs.new');
            await page.waitForSelector(selectors.gdocs.titleInput, { timeout: 10000 });
            await page.fill(selectors.gdocs.titleInput, title);
            await page.keyboard.press('Enter');
        });
        
        // Brief wait for title to save
        if (ctx.config.slowMo) await page.waitForTimeout(1000);
        
        return page.url();
    } catch (e: any) {
        log(`Failed to create Google Doc: ${e.message}`, 'error');
        return null;
    }
}

/**
 * Ensures the tabs & outline sidebar is open.
 */
export async function ensureTabsSidebarOpen(ctx: UniversalContext, deps: GDocsActionDeps): Promise<void> {
    const { page } = ctx;
    const selectors = deps.selectors;
    
    const sidebarToggle = page.locator(selectors.gdocs.tabs.toggleSidebar);
    if (await sidebarToggle.isVisible()) {
        const expanded = await sidebarToggle.getAttribute('aria-expanded');
        if (expanded === 'false') {
            await withHumanHands(async () => {
                await sidebarToggle.click();
            });
            if (ctx.config?.slowMo) await page.waitForTimeout(500);
        }
    }
}

/**
 * Switches to a specific tab by its name.
 */
export async function switchGDocTabAction(ctx: UniversalContext, deps: GDocsActionDeps, tabName: string): Promise<boolean> {
    const { page, log } = ctx;
    const selectors = deps.selectors;
    
    await ensureTabsSidebarOpen(ctx, deps);
    
    const tab = page.locator(selectors.gdocs.tabs.tabItem).filter({ hasText: tabName }).first();
    if (await tab.isVisible()) {
        await withHumanHands(async () => {
            await tab.click();
        });
        return true;
    }
    
    log(`Tab "${tabName}" not found.`, 'warn');
    return false;
}

/**
 * Adds a new tab to the document.
 */
export async function addGDocTabAction(ctx: UniversalContext, deps: GDocsActionDeps, name?: string): Promise<boolean> {
    const { page, log } = ctx;
    const selectors = deps.selectors;
    
    await ensureTabsSidebarOpen(ctx, deps);
    
    try {
        await withHumanHands(async () => {
            const addBtn = page.locator(selectors.gdocs.tabs.addTab);
            await addBtn.click();
        });
        
        if (name) {
            // New tab is usually active and in rename mode or just "Tab X"
            // We might need to rename it explicitly
            await renameActiveGDocTabAction(ctx, deps, name);
        }
        
        return true;
    } catch (e: any) {
        log(`Failed to add tab: ${e.message}`, 'error');
        return false;
    }
}

/**
 * Renames the currently active tab.
 */
export async function renameActiveGDocTabAction(ctx: UniversalContext, deps: GDocsActionDeps, newName: string): Promise<boolean> {
    const { page, log } = ctx;
    const selectors = deps.selectors;
    
    await ensureTabsSidebarOpen(ctx, deps);
    
    try {
        // Active tab usually has aria-selected="true"
        const activeTab = page.locator(`${selectors.gdocs.tabs.tabItem}[aria-selected="true"]`).first();
        if (!await activeTab.isVisible()) return false;
        
        await withHumanHands(async () => {
            await activeTab.hover();
            const optionsBtn = activeTab.locator(selectors.gdocs.tabs.tabOptions);
            await optionsBtn.click();
            
            // Wait for menu and click Rename
            const renameOption = page.locator('div[role="menuitem"]').filter({ hasText: /Rename|Přejmenovat/i });
            await renameOption.click();
            
            await page.keyboard.type(newName);
            await page.keyboard.press('Enter');
        });
        
        return true;
    } catch (e: any) {
        log(`Failed to rename tab: ${e.message}`, 'error');
        return false;
    }
}

/**
 * Deletes a tab by name.
 */
export async function deleteGDocTabAction(ctx: UniversalContext, deps: GDocsActionDeps, tabName: string): Promise<boolean> {
    const { page, log } = ctx;
    const selectors = deps.selectors;
    
    await ensureTabsSidebarOpen(ctx, deps);
    
    try {
        const tab = page.locator(selectors.gdocs.tabs.tabItem).filter({ hasText: tabName }).first();
        if (!await tab.isVisible()) return false;
        
        await withHumanHands(async () => {
            await tab.hover();
            const optionsBtn = tab.locator(selectors.gdocs.tabs.tabOptions);
            await optionsBtn.click();
            
            const deleteOption = page.locator('div[role="menuitem"]').filter({ hasText: /Delete|Smazat/i });
            await deleteOption.click();
            
            // Handle confirmation if any
            const confirmBtn = page.locator('button').filter({ hasText: /Delete|Smazat/i });
            if (await confirmBtn.isVisible()) {
                await confirmBtn.click();
            }
        });
        
        return true;
    } catch (e: any) {
        log(`Failed to delete tab: ${e.message}`, 'error');
        return false;
    }
}

/**
 * Lists all tab names in the document.
 */
export async function listGDocTabsAction(ctx: UniversalContext, deps: GDocsActionDeps): Promise<string[]> {
    const { page } = ctx;
    const selectors = deps.selectors;
    
    await ensureTabsSidebarOpen(ctx, deps);
    
    const tabs = page.locator(selectors.gdocs.tabs.tabItem);
    const count = await tabs.count();
    const names: string[] = [];
    
    for (let i = 0; i < count; i++) {
        const text = await tabs.nth(i).innerText();
        if (text) names.push(text.trim());
    }
    
    return names;
}

/**
 * Adds a subtab to a specific parent tab.
 */
export async function addSubtabGDocAction(ctx: UniversalContext, deps: GDocsActionDeps, parentTabName: string, subtabName?: string): Promise<boolean> {
    const { page, log } = ctx;
    const selectors = deps.selectors;
    
    await ensureTabsSidebarOpen(ctx, deps);
    
    try {
        const tab = page.locator(selectors.gdocs.tabs.tabItem).filter({ hasText: parentTabName }).first();
        if (!await tab.isVisible()) return false;
        
        await withHumanHands(async () => {
            await tab.hover();
            const optionsBtn = tab.locator(selectors.gdocs.tabs.tabOptions);
            await optionsBtn.click();
            
            const addSubtabOption = page.locator('div[role="menuitem"]').filter({ hasText: /Add subtab|Přidat podzáložku/i });
            await addSubtabOption.click();
        });
        
        if (subtabName) {
            await renameActiveGDocTabAction(ctx, deps, subtabName);
        }
        
        return true;
    } catch (e: any) {
        log(`Failed to add subtab to "${parentTabName}": ${e.message}`, 'error');
        return false;
    }
}

/**
 * Duplicates a tab by name.
 */
export async function duplicateGDocTabAction(ctx: UniversalContext, deps: GDocsActionDeps, tabName: string): Promise<boolean> {
    const { page, log } = ctx;
    const selectors = deps.selectors;
    
    await ensureTabsSidebarOpen(ctx, deps);
    
    try {
        const tab = page.locator(selectors.gdocs.tabs.tabItem).filter({ hasText: tabName }).first();
        if (!await tab.isVisible()) return false;
        
        await withHumanHands(async () => {
            await tab.hover();
            const optionsBtn = tab.locator(selectors.gdocs.tabs.tabOptions);
            await optionsBtn.click();
            
            const duplicateOption = page.locator('div[role="menuitem"]').filter({ hasText: /Duplicate|Duplikovat/i });
            await duplicateOption.click();
        });
        
        return true;
    } catch (e: any) {
        log(`Failed to duplicate tab "${tabName}": ${e.message}`, 'error');
        return false;
    }
}

/**
 * Writes content to the active document/tab.
 */
export async function writeToGDocAction(ctx: UniversalContext, content: string, options: { append?: boolean } = {}): Promise<boolean> {
    const { page, log } = ctx;
    const selectors = ctx.config.selectors;
    
    try {
        await withHumanHands(async () => {
            const editor = page.locator(selectors.gdocs.editor).first();
            await editor.click();
            
            if (!options.append) {
                // Clear content (Control+A, Backspace)
                await page.keyboard.press('Control+A');
                await page.keyboard.press('Backspace');
            } else {
                // Go to end (Control+End)
                await page.keyboard.press('Control+End');
            }
            
            // High-fidelity insertion
            await page.keyboard.insertText(content);
        });
        
        return true;
    } catch (e: any) {
        log(`Failed to write to GDoc: ${e.message}`, 'error');
        return false;
    }
}
