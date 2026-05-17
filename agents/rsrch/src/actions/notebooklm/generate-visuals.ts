import { UniversalContext, NotebookLMActionDeps } from '../types';
import { maximizeStudioAction } from './studio';

/**
 * Triggers the generation of a Slide Deck (Presentation) in NotebookLM.
 */
export async function generatePresentationAction(
    ctx: UniversalContext,
    deps: NotebookLMActionDeps,
    options: { sources?: string[] } = {}
): Promise<boolean> {
    const { page, log } = ctx;
    const { selectors } = deps;
    const { sources } = options;

    log('Generating Slide Deck (Presentation)...');

    try {
        await maximizeStudioAction(ctx, deps);
        
        if (sources && sources.length > 0) {
            await deps.selectSources!(sources);
        }

        const presentationBtn = page.locator(`${selectors.studio.presentationButtonCs}, ${selectors.studio.presentationButtonEn}, ${selectors.studio.presentationButtonFallback}`).first();
        if (await presentationBtn.count() === 0) {
            log('Presentation (Slide deck) button not found in studio.', 'error');
            return false;
        }

        await presentationBtn.click();
        log('Presentation generation triggered.');
        
        // Wait for generation to start/indicator
        await page.waitForTimeout(2000);
        return true;
    } catch (e: any) {
        log(`Failed to generate presentation: ${e.message}`, 'error');
        return false;
    }
}

/**
 * Triggers the generation of an Infographic in NotebookLM.
 */
export async function generateInfographicAction(
    ctx: UniversalContext,
    deps: NotebookLMActionDeps,
    options: { sources?: string[] } = {}
): Promise<boolean> {
    const { page, log } = ctx;
    const { selectors } = deps;
    const { sources } = options;

    log('Generating Infographic...');

    try {
        await maximizeStudioAction(ctx, deps);
        
        if (sources && sources.length > 0) {
            await deps.selectSources!(sources);
        }

        const infographicBtn = page.locator(`${selectors.studio.infographicButtonCs}, ${selectors.studio.infographicButtonEn}, ${selectors.studio.infographicButtonFallback}`).first();
        if (await infographicBtn.count() === 0) {
            log('Infographic button not found in studio.', 'error');
            return false;
        }

        await infographicBtn.click();
        log('Infographic generation triggered.');
        
        // Wait for generation to start/indicator
        await page.waitForTimeout(2000);
        return true;
    } catch (e: any) {
        log(`Failed to generate infographic: ${e.message}`, 'error');
        return false;
    }
}
