import { GeminiActionDeps, UniversalContext } from '../types';

export async function listDeepResearchDocsAction(ctx: UniversalContext, deps: GeminiActionDeps, limit: number = 10): Promise<any[]> {
    const { page } = ctx;
    const { selectors } = deps;
    
    ctx.log(`Listing ${limit} Deep Research documents...`);
    
    // Ensure sidebar is open to see "My Stuff" or research docs
    // Deep Research docs are often listed in the "My Stuff" sidebar section
    const myStuff = page.locator(selectors.gemini.sidebar.myStuff).first();
    if (await myStuff.isVisible()) {
        await myStuff.click();
        await page.waitForTimeout(1000);
    }

    const docCards = page.locator(selectors.gemini.deepResearch.documentCard);
    const count = await docCards.count();
    
    const docs: any[] = [];
    const end = Math.min(limit, count);

    for (let i = 0; i < end; i++) {
        const card = docCards.nth(i);
        const title = await card.locator(selectors.gemini.deepResearch.documentTitle).innerText().catch(() => 'Untitled Document');
        const id = await card.getAttribute('data-id') || `doc_${i}`;
        
        docs.push({ id, title });
    }

    return docs;
}

export async function getAllResearchDocsInSessionAction(ctx: UniversalContext, deps: GeminiActionDeps): Promise<any[]> {
    const { page } = ctx;
    const { selectors } = deps;
    
    ctx.log(`Getting all research documents in current session...`);
    
    // Look for the research panel toggle or button
    const panelToggle = page.locator(selectors.gemini.deepResearch.toggle || '.research-toggle').first();
    if (await panelToggle.isVisible()) {
        await panelToggle.click();
        await page.waitForTimeout(1000);
    }

    const docCards = page.locator(selectors.gemini.deepResearch.documentCard);
    const count = await docCards.count();
    
    const docs: any[] = [];
    for (let i = 0; i < count; i++) {
        const card = docCards.nth(i);
        const title = await card.locator(selectors.gemini.deepResearch.documentTitle).innerText().catch(() => 'Untitled Document');
        
        // Deep research docs in session usually open in an immersive view when clicked
        docs.push({ 
            index: i,
            title,
            type: 'deep-research-doc'
        });
    }

    return docs;
}
