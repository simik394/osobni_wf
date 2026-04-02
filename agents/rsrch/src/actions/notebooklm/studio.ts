import { UniversalContext, NotebookLMActionDeps } from '../types';

/**
 * Gets all studio artifacts from the current notebook.
 */
export async function getStudioArtifactsAction(
    ctx: UniversalContext,
    deps: NotebookLMActionDeps
): Promise<Array<{ 
    type: 'audio' | 'note' | 'faq' | 'briefing' | 'timeline' | 'table' | 'presentation' | 'other'; 
    title: string; 
    details?: string; 
    sourceCount?: number; 
    absoluteTime?: string; 
    id?: string; 
}>> {
    const { page, log } = ctx;
    const artifacts: Array<{ 
        type: 'audio' | 'note' | 'faq' | 'briefing' | 'timeline' | 'table' | 'presentation' | 'other'; 
        title: string; 
        details?: string; 
        sourceCount?: number; 
        absoluteTime?: string; 
        id?: string; 
    }> = [];

    try {
        log('Extracting studio artifacts...');
        // Ensure studio is maximized (if applicable)
        const studioBtn = page.locator('button').filter({ hasText: /Notebook Guide|Studio/i }).first();
        if (await studioBtn.count() > 0 && await studioBtn.isVisible()) {
            await studioBtn.click();
            await deps.humanDelay(2500);
        }

        const studioPanel = page.locator('div.right-panel, section.studio-panel, .studio-panel').first();
        if (await studioPanel.count() === 0) {
            log('Studio panel not found.', 'error');
            return [];
        }

        const scrollable = studioPanel.locator('div.panel-content-scrollable, .panel-content-scrollable').first();
        const container = (await scrollable.count() > 0) ? scrollable : studioPanel;
        
        const artifactItems = container.locator('.artifact-stretched-button');
        const count = await artifactItems.count();
        log(`Found ${count} artifact items in studio-panel`);

        for (let i = 0; i < count; i++) {
            const item = artifactItems.nth(i);
            
            const titleLoc = item.locator('.artifact-title, div.artifact-title').first();
            let titleText = '';
            if (await titleLoc.count() > 0) {
                titleText = await titleLoc.evaluate(el => (el as HTMLElement).innerText.trim()).catch(() => '');
            }
            
            const iconLoc = item.locator('mat-icon, .artifact-icon, .mat-icon').first();
            let iconText = '';
            if (await iconLoc.count() > 0) {
                iconText = await iconLoc.evaluate(el => (el as HTMLElement).innerText.trim()).catch(() => '');
            }

            if (!titleText || titleText.length < 2) {
                titleText = `Artifact ${i + 1}`;
            }

            // Determine type based on icon text
            let type: 'audio' | 'note' | 'faq' | 'briefing' | 'timeline' | 'table' | 'presentation' | 'other' = 'other';
            if (iconText.includes('audio_magic_eraser')) type = 'audio';
            else if (iconText.includes('sticky_note_2') || iconText.includes('description')) type = 'note';
            else if (iconText.includes('help') || titleText.toLowerCase().includes('faq')) type = 'faq';
            else if (iconText.includes('auto_tab_group')) {
                if (titleText.toLowerCase().includes('faq')) type = 'faq';
                else type = 'briefing';
            }
            else if (iconText.includes('timeline')) type = 'timeline';
            else if (iconText.includes('table_view')) type = 'table';
            else if (iconText.includes('tablet')) type = 'presentation';

            let detailsResult = '';
            const metadataLoc = item.locator('.artifact-metadata').first();
            if (await metadataLoc.count() > 0) {
                detailsResult = (await metadataLoc.innerText().catch(() => '')).trim();
            }

            let sourceCount = undefined;
            if (detailsResult) {
                const sourceMatch = detailsResult.match(/(\d+)\s*zdroj/i) || detailsResult.match(/(\d+)\s*source/i);
                if (sourceMatch) sourceCount = parseInt(sourceMatch[1]);
            }

            let id = undefined;
            const labelSpan = item.locator('.artifact-labels').first();
            if (await labelSpan.count() > 0) {
                const labelId = await labelSpan.getAttribute('id');
                if (labelId) id = labelId.replace('artifact-labels-', '').replace('note-labels-', '');
            }

            artifacts.push({
                type,
                title: titleText,
                details: detailsResult,
                sourceCount,
                id
            });
        }
    } catch (e: any) {
        log(`Error extracting studio artifacts: ${e.message}`, 'error');
    }

    return artifacts;
}
