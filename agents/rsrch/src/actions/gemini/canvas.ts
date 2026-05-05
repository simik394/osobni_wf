import { UniversalContext, GeminiActionDeps } from '../types';
import { scrollToTopAction } from './history';

/**
 * Lists all artifacts/canvas documents associated with the current session.
 * 
 * @param ctx UniversalContext
 * @param deps Dependencies
 */
export async function listSessionArtifactsAction(
    ctx: UniversalContext,
    deps: GeminiActionDeps
): Promise<Array<{ name: string; id?: string; type: string }>> {
    const { page, log } = ctx;
    const { selectors } = deps;

    log('Listing session artifacts...');

    // 1. Ensure all history is loaded
    await scrollToTopAction(ctx, deps);

    const artifacts: Array<{ name: string; id?: string; type: string }> = [];

    try {
        // 2. Open the "More options" menu in the session header
        const moreBtn = page.locator(selectors.gemini.session.moreMenu).first();
        if (await moreBtn.isVisible()) {
            await moreBtn.click();
            await page.waitForTimeout(1000);

            // Look for "Files" or "Artifacts" list
            // Note: In some UI versions, it's a sub-menu or a list in the dialog
            const fileItems = page.locator(selectors.gemini.session.artifactItem);
            const count = await fileItems.count();

            for (let i = 0; i < count; i++) {
                const item = fileItems.nth(i);
                const text = await item.innerText();
                if (text) {
                    artifacts.push({ name: text.trim(), type: 'artifact' });
                }
            }

            // Close menu
            await page.keyboard.press('Escape');
        }

        // 3. Fallback: Scan chat history for artifact blocks
        // Sometimes artifacts have their own "Open" buttons in the chat
        const artifactCards = page.locator('button:has-text("Open in Canvas"), button:has-text("Otevřít v prostředí Canvas")');
        const cardCount = await artifactCards.count();
        for (let i = 0; i < cardCount; i++) {
            const card = artifactCards.nth(i);
            // Try to find a title nearby
            const parent = card.locator('xpath=..'); // Adjust as needed
            const title = await parent.innerText().catch(() => `Artifact ${i + 1}`);
            
            if (!artifacts.find(a => a.name === title)) {
                artifacts.push({ name: title.split('\n')[0].trim(), type: 'canvas-inline' });
            }
        }

    } catch (e: any) {
        log(`Error listing artifacts: ${e.message}`, 'error');
    }

    log(`Found ${artifacts.length} artifacts.`);
    return artifacts;
}

/**
 * Extracts the content from the currently open Canvas/Artifact panel.
 * 
 * @param ctx UniversalContext
 * @param deps Dependencies
 */
export async function readCanvasAction(
    ctx: UniversalContext,
    deps: GeminiActionDeps
): Promise<{ title: string; content: string; markdown: string } | null> {
    const { page, log } = ctx;
    const { selectors } = deps;

    log('Reading current Canvas content...');

    try {
        const sidePanel = page.locator(selectors.gemini.canvas.sidePanel).first();
        if (!await sidePanel.isVisible()) {
            log('Canvas side panel is not visible.', 'warn');
            return null;
        }

        const titleEl = sidePanel.locator(selectors.gemini.canvas.header + ' h1, ' + selectors.gemini.canvas.header + ' h2').first();
        const title = await titleEl.innerText().catch(() => 'Untitled');

        const editor = sidePanel.locator(selectors.gemini.canvas.content).first();
        const content = await editor.innerText();
        const html = await editor.innerHTML();
        
        // Simple HTML to Markdown conversion (could be improved)
        const markdown = content; // Placeholder

        return { title, content, markdown };
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
        // Try the menu first
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

        // Try chat history
        const card = page.locator(`button:has-text("Open"):has-text("${name}"), button:has-text("Otevřít"):has-text("${name}")`).first();
        if (await card.isVisible()) {
            await card.click();
            await page.waitForTimeout(2000);
            return true;
        }

        return false;
    } catch (e: any) {
        log(`Failed to open artifact ${name}: ${e.message}`, 'error');
        return false;
    }
}
