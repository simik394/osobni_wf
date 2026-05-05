import { GeminiActionDeps, UniversalContext } from '../types';

export async function listGemsAction(ctx: UniversalContext, deps: GeminiActionDeps): Promise<any[]> {
    const { page } = ctx;
    const { selectors } = deps;
    
    ctx.log('Listing available Gems...');
    
    // Ensure sidebar is open and Gems section is visible
    // We might need to click a "Gems" or "Gem manager" button
    const gemsLink = page.locator('a:has-text("Gems"), button:has-text("Gems"), [aria-label*="Gems"]').first();
    if (await gemsLink.isVisible()) {
        await gemsLink.click();
        await page.waitForTimeout(1000);
    } else {
        // Try navigation if sidebar link not visible
        await page.goto('https://gemini.google.com/gems', { waitUntil: 'networkidle' }).catch(() => {});
    }

    await page.waitForSelector(selectors.gemini.gems.card, { timeout: 5000 }).catch(() => {
        ctx.log('No Gem cards found, might be empty or wrong page', 'warn');
    });

    const gems = await page.evaluate((sel) => {
        const cards = Array.from(document.querySelectorAll(sel.card));
        return cards.map(card => {
            const nameEl = card.querySelector(sel.name);
            const link = card.closest('a') || card.querySelector('a');
            return {
                id: link?.getAttribute('href')?.split('/').pop() || null,
                name: nameEl?.textContent?.trim() || 'Unknown Gem',
                url: link?.getAttribute('href') || null
            };
        });
    }, selectors.gemini.gems);

    return gems;
}

export async function selectGemAction(ctx: UniversalContext, deps: GeminiActionDeps, name: string): Promise<boolean> {
    const { page } = ctx;
    const { selectors } = deps;

    ctx.log(`Selecting Gem: ${name}...`);
    
    // Check if we are already in a chat with this Gem
    const currentTitle = await page.title();
    if (currentTitle.includes(name)) {
        ctx.log(`Already in chat with ${name}`);
        return true;
    }

    const gems = await listGemsAction(ctx, deps);
    const target = gems.find(g => g.name.toLowerCase().includes(name.toLowerCase()) || g.id === name);
    
    if (!target) {
        ctx.log(`Gem not found: ${name}`, 'error');
        return false;
    }

    ctx.log(`Navigating to Gem: ${target.name} (${target.id})`);
    await page.goto(`https://gemini.google.com/app?gem=${target.id}`, { waitUntil: 'networkidle' });
    
    return true;
}

export async function openGemAction(ctx: UniversalContext, deps: GeminiActionDeps, nameOrId: string): Promise<boolean> {
    return selectGemAction(ctx, deps, nameOrId);
}

export async function createGemAction(ctx: UniversalContext, deps: GeminiActionDeps, options: { name: string, instructions: string, files?: string[] }): Promise<string> {
    const { page } = ctx;
    const { selectors } = deps;
    
    ctx.log(`Creating Gem: ${options.name}...`);
    
    await page.goto('https://gemini.google.com/gems/create', { waitUntil: 'networkidle' });
    
    await page.fill(selectors.gemini.gems.nameInput, options.name);
    await page.fill(selectors.gemini.gems.instructionInput, options.instructions);
    
    if (options.files && options.files.length > 0) {
        ctx.log('Uploading files for Gem...');
        // TODO: Reuse uploadFilesAction
    }

    await page.click(selectors.gemini.gems.save);
    await page.waitForNavigation({ waitUntil: 'networkidle' });
    
    const url = page.url();
    const id = url.split('/').pop() || '';
    ctx.log(`Gem created successfully: ${id}`);
    return id;
}

export async function updateGemAction(ctx: UniversalContext, deps: GeminiActionDeps, gemId: string, options: { name?: string, instructions?: string, files?: string[] }): Promise<boolean> {
    const { page } = ctx;
    const { selectors } = deps;
    
    ctx.log(`Updating Gem: ${gemId}...`);
    
    await page.goto(`https://gemini.google.com/gems/edit/${gemId}`, { waitUntil: 'networkidle' });
    
    if (options.name) await page.fill(selectors.gemini.gems.nameInput, options.name);
    if (options.instructions) await page.fill(selectors.gemini.gems.instructionInput, options.instructions);
    
    await page.click(selectors.gemini.gems.save);
    await page.waitForNavigation({ waitUntil: 'networkidle' });
    
    return true;
}

export async function deleteGemAction(ctx: UniversalContext, deps: GeminiActionDeps, gemId: string): Promise<boolean> {
    const { page } = ctx;
    
    ctx.log(`Deleting Gem: ${gemId}...`);
    
    await page.goto(`https://gemini.google.com/gems/edit/${gemId}`, { waitUntil: 'networkidle' });
    
    const deleteBtn = page.locator('button:has-text("Delete"), [aria-label*="Delete"]').first();
    await deleteBtn.click();
    
    const confirmBtn = page.locator('button:has-text("Confirm"), button:has-text("Delete")').last();
    await confirmBtn.click();
    
    await page.waitForNavigation({ waitUntil: 'networkidle' });
    return true;
}

export async function chatWithGemAction(ctx: UniversalContext, deps: GeminiActionDeps, nameOrId: string, message: string): Promise<string | null> {
    ctx.log(`Chatting with Gem: ${nameOrId}...`);
    
    const opened = await openGemAction(ctx, deps, nameOrId);
    if (!opened) throw new Error(`Failed to open Gem: ${nameOrId}`);
    
    const { sendMessageAction } = await import('./chat');
    return sendMessageAction(ctx, message, {}, deps);
}
