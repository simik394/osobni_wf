import { UniversalContext, GeminiActionDeps } from '../types';
import { scrollToTopAction } from './history';

/**
 * Lists all artifacts/canvas documents associated with the current session.
 * 
 * @param ctx UniversalContext
 * @param deps Dependencies
 */
/**
 * Lists all artifacts/canvas documents associated with the current session.
 */
export async function listSessionArtifactsAction(
    ctx: UniversalContext,
    deps: GeminiActionDeps
): Promise<Array<{ name: string; id?: string; type: string }>> {
    const { page, log } = ctx;
    const { selectors } = deps;

    log('Listing session artifacts (discovery mode)...');

    // 1. Ensure enough history is loaded for discovery
    await scrollToTopAction(ctx, deps, { limit: 50 }); 

    const artifacts: Array<{ name: string; id?: string; type: string }> = [];

    try {
        // 2. Open the "More options" menu in the session header
        const moreBtn = page.locator(selectors.gemini.session.moreMenu).first();
        if (await moreBtn.isVisible()) {
            await moreBtn.click();
            await page.waitForTimeout(1000);

            const fileItems = page.locator(selectors.gemini.session.artifactItem);
            const count = await fileItems.count();

            for (let i = 0; i < count; i++) {
                const item = fileItems.nth(i);
                const text = await item.innerText();
                if (text) {
                    artifacts.push({ name: text.trim(), type: 'artifact' });
                }
            }
            await page.keyboard.press('Escape');
        }

        // 3. Scan chat history for "Open in Canvas" buttons
        const canvasButtonSelectors = [
            'button:has-text("Open in Canvas")',
            'button:has-text("Otevřít v prostředí Canvas")',
            'button:has-text("Otevřít")',
            'button[aria-label*="Canvas" i]'
        ];

        for (const sel of canvasButtonSelectors) {
            const buttons = page.locator(sel);
            const count = await buttons.count();
            for (let i = 0; i < count; i++) {
                const btn = buttons.nth(i);
                // Try to find title in the parent card
                const title = await btn.evaluate(node => {
                    const card = node.closest('[role="article"], .chat-message, .card');
                    return card?.querySelector('h1, h2, h3, b, strong')?.textContent || 'Untitled Artifact';
                }).catch(() => 'Untitled Artifact');

                if (!artifacts.find(a => a.name === title)) {
                    artifacts.push({ name: title.trim(), type: 'canvas-discovery' });
                }
            }
        }

    } catch (e: any) {
        log(`Error listing artifacts: ${e.message}`, 'error');
    }

    log(`Found ${artifacts.length} artifacts.`);
    return artifacts;
}

/**
 * Extracts content from Canvas.
 */
export async function readCanvasAction(
    ctx: UniversalContext,
    deps: GeminiActionDeps
): Promise<{ title: string; content: string; markdown: string; references: string[] } | null> {
    const { page, log } = ctx;
    const { selectors } = deps;

    log('Reading Canvas content...');

    try {
        const sidePanel = page.locator(selectors.gemini.canvas.sidePanel).first();
        await sidePanel.waitFor({ state: 'visible', timeout: 5000 });

        const titleEl = sidePanel.locator(selectors.gemini.canvas.header + ' h1, ' + selectors.gemini.canvas.header + ' h2').first();
        const title = await titleEl.innerText().catch(() => 'Untitled');

        const editor = sidePanel.locator(selectors.gemini.canvas.content).first();
        await editor.waitFor({ state: 'visible', timeout: 5000 });
        
        const content = await editor.innerText();
        const html = await editor.innerHTML();
        
        // Extract References/Citations
        const references: string[] = [];
        const links = editor.locator('a[href*="http"]');
        const linkCount = await links.count();
        for (let i = 0; i < linkCount; i++) {
            const href = await links.nth(i).getAttribute('href');
            if (href && !references.includes(href) && !href.includes('google.com')) {
                references.push(href);
            }
        }

        // Basic HTML -> MD conversion
        let markdown = html
            .replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n')
            .replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n')
            .replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n')
            .replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n')
            .replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n')
            .replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**')
            .replace(/<b[^>]*>(.*?)<\/b>/gi, '**$1**')
            .replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*')
            .replace(/<i[^>]*>(.*?)<\/i>/gi, '*$1*')
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<[^>]+>/g, ''); 

        return { title, content, markdown, references };
    } catch (e: any) {
        log(`Error reading canvas: ${e.message}`, 'error');
        return null;
    }
}

/**
 * Opens a specific artifact by name.
 */
export async function openArtifactAction(
    ctx: UniversalContext,
    deps: GeminiActionDeps,
    name: string
): Promise<boolean> {
    const { page, log } = ctx;
    const { selectors } = deps;

    log(`Opening artifact: ${name}`);

    try {
        // 1. Try chat history (often more reliable than the menu)
        const buttons = page.locator(`button:has-text("${name}"), button:has-text("Otevřít")`);
        const count = await buttons.count();
        for (let i = 0; i < count; i++) {
            const btn = buttons.nth(i);
            const parentText = await btn.evaluate(node => (node.closest('.card, .chat-message') as HTMLElement)?.innerText || '');
            if (parentText.includes(name)) {
                log(`Found artifact button for "${name}" in chat history.`);
                await btn.click();
                await page.waitForTimeout(2000);
                return true;
            }
        }

        // 2. Try the menu
        const moreBtn = page.locator(selectors.gemini.session.moreMenu).first();
        if (await moreBtn.isVisible()) {
            await moreBtn.click();
            await page.waitForTimeout(500);
            const item = page.locator(`${selectors.gemini.session.artifactItem}:has-text("${name}")`).first();
            if (await item.isVisible()) {
                await item.click();
                await page.waitForTimeout(2000);
                return true;
            }
            await page.keyboard.press('Escape');
        }

        return false;
    } catch (e: any) {
        log(`Failed to open artifact ${name}: ${e.message}`, 'error');
        return false;
    }
}
