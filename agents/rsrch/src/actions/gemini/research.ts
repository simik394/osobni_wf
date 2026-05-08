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

export async function readDeepResearchDocAction(
    ctx: UniversalContext, 
    deps: GeminiActionDeps, 
    index: number
): Promise<{ title: string; markdown: string; references: string[]; thoughts?: string } | null> {
    const { page, log } = ctx;
    const { selectors } = deps;
    
    log(`Reading Deep Research document at index ${index}...`);
    
    try {
        const docCards = page.locator(selectors.gemini.deepResearch.documentCard);
        if (await docCards.count() <= index) {
            log(`Document index ${index} out of range.`, 'error');
            return null;
        }

        const card = docCards.nth(index);
        await card.scrollIntoViewIfNeeded();
        await card.click();
        await page.waitForTimeout(3000); // Wait for immersive view

        const panel = page.locator(selectors.gemini.deepResearch.panel).first();
        await panel.waitFor({ state: 'visible', timeout: 5000 });

        const title = await panel.locator(selectors.gemini.deepResearch.documentTitle).first().innerText().catch(() => 'Untitled Research');
        
        // Scroll to bottom to ensure all sources and sections are loaded
        log('Scrolling to load all sections...');
        await panel.evaluate(el => el.scrollTo(0, el.scrollHeight));
        await page.waitForTimeout(1000);
        await panel.evaluate(el => el.scrollTo(0, el.scrollHeight));
        await page.waitForTimeout(1000);

        const html = await panel.innerHTML();
        
        // Extract Thoughts
        let thoughts: string | undefined;
        const thoughtsBtn = page.locator(selectors.gemini.deepResearch.thoughtsSection || 'button:has-text("Thoughts")').first();
        if (await thoughtsBtn.isVisible()) {
            await thoughtsBtn.click();
            await page.waitForTimeout(1000);
            thoughts = await page.locator('.thoughts-content, .reasoning-content').innerText().catch(() => undefined);
            // Close thoughts if it's a modal
            await page.keyboard.press('Escape');
        }

        // Extract References
        const references: string[] = [];
        const links = page.locator(selectors.gemini.deepResearch.sourceLink || 'a[href*="http"]');
        const linkCount = await links.count();
        for (let i = 0; i < linkCount; i++) {
            const href = await links.nth(i).getAttribute('href');
            if (href && !references.includes(href) && !href.includes('google.com')) {
                references.push(href);
            }
        }

        // Convert to Markdown (basic)
        let markdown = html
            .replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n')
            .replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n')
            .replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n')
            .replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n')
            .replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n')
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<[^>]+>/g, '');

        // Close the document
        await page.keyboard.press('Escape');

        return { title, markdown, references, thoughts };
    } catch (e: any) {
        log(`Error reading deep research doc: ${e.message}`, 'error');
        return null;
    }
}

/**
 * Gets all research documents in the current session (listing only).
 */
export async function getAllResearchDocsInSessionAction(ctx: UniversalContext, deps: GeminiActionDeps): Promise<any[]> {
    const { page } = ctx;
    const { selectors } = deps;
    
    ctx.log(`Getting all research documents in current session...`);
    
    const docCards = page.locator(selectors.gemini.deepResearch.documentCard);
    const count = await docCards.count();
    
    const docs: any[] = [];
    for (let i = 0; i < count; i++) {
        const card = docCards.nth(i);
        const title = await card.locator(selectors.gemini.deepResearch.documentTitle).first().innerText().catch(() => 'Untitled Document');
        
        docs.push({ 
            index: i,
            title,
            type: 'deep-research-doc'
        });
    }

    return docs;
}
