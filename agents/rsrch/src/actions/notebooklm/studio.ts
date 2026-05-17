import { UniversalContext, NotebookLMActionDeps } from '../types';

/**
 * Gets all studio artifacts from the current notebook.
 */
export async function getStudioArtifactsAction(
    ctx: UniversalContext,
    deps: NotebookLMActionDeps
): Promise<Array<{ 
    type: 'audio' | 'presentation' | 'video' | 'mindmap' | 'briefing' | 'cards' | 'quiz' | 'infographic' | 'table' | 'other'; 
    title: string; 
    isSystem?: boolean;
    details?: string; 
    sourceCount?: number; 
    absoluteTime?: string; 
    id?: string; 
}>> {
    const { page, log } = ctx;
    const artifacts: Array<{ 
        type: 'audio' | 'presentation' | 'video' | 'mindmap' | 'briefing' | 'cards' | 'quiz' | 'infographic' | 'table' | 'other'; 
        title: string; 
        isSystem?: boolean;
        details?: string; 
        sourceCount?: number; 
        absoluteTime?: string; 
        id?: string; 
    }> = [];

    try {
        log('Extracting studio artifacts...');
        // Ensure studio is maximized (if applicable)
        await maximizeStudioAction(ctx, deps);

        const studioPanel = page.locator('div.right-panel, section.studio-panel, .studio-panel').first();
        if (await studioPanel.count() === 0) {
            log('Studio panel not found.', 'error');
            return [];
        }

        // Close any active artifact viewer to see the list
        const collapseBtn = studioPanel.locator('button').filter({ has: page.locator('mat-icon:has-text("collapse_content")') }).first();
        if (await collapseBtn.count() > 0 && await collapseBtn.isVisible()) {
            log('Closing active artifact viewer to see list...');
            await collapseBtn.click();
            await deps.humanDelay(1500);
        }

        const scrollable = studioPanel.locator('div.panel-content-scrollable, .panel-content-scrollable').first();
        const container = (await scrollable.count() > 0) ? scrollable : studioPanel;
        
        const artifactItems = container.locator('.artifact-stretched-button');
        const count = await artifactItems.count();
        log(`Found ${count} artifact items in studio-panel`);

        const systemTitles = [
            'faq', 'study guide', 'table of contents', 'briefing doc', 
            'často kladené otázky', 'studijní příručka', 'obsah', 'dokument s pokyny'
        ];

        for (let i = 0; i < count; i++) {
            // The stretched button is just an absolute overlay; the actual content is its sibling.
            // So we take the parent element as the container for this artifact.
            const item = artifactItems.nth(i).locator('xpath=..');
            
            const titleLoc = item.locator('.artifact-title, div.artifact-title, [class*="title"]').first();
            let titleText = '';
            if (await titleLoc.count() > 0) {
                // If it's an input field, get the value
                const tagName = await titleLoc.evaluate(el => el.tagName.toLowerCase()).catch(() => '');
                if (tagName === 'input' || tagName === 'textarea') {
                    titleText = await titleLoc.inputValue().catch(() => '');
                } else {
                    titleText = await titleLoc.evaluate(el => (el as HTMLElement).innerText.trim()).catch(() => '');
                }
            }
            
            if (!titleText || titleText.length < 2) {
                const fullText = await item.evaluate(el => (el as HTMLElement).innerText.trim()).catch(() => '');
                if (fullText) {
                    titleText = fullText.split('\n')[0].trim();
                }
            }

            const iconLoc = item.locator('mat-icon, .artifact-icon, .mat-icon').first();
            let iconText = '';
            if (await iconLoc.count() > 0) {
                iconText = await iconLoc.evaluate(el => (el as HTMLElement).innerText.trim()).catch(() => '');
            }

            if (!titleText || titleText.length < 2) {
                titleText = `Artifact ${i + 1}`;
            }


            // Determine type based on icon (Modern Robust Detection)
            let type: 'audio' | 'presentation' | 'video' | 'mindmap' | 'briefing' | 'cards' | 'quiz' | 'infographic' | 'table' | 'other' = 'other';
            const lowIcon = iconText.toLowerCase();

            if (lowIcon.includes('audio_magic_eraser')) type = 'audio';
            else if (lowIcon.includes('tablet')) type = 'presentation';
            else if (lowIcon.includes('subscriptions')) type = 'video';
            else if (lowIcon.includes('flowchart')) type = 'mindmap';
            else if (lowIcon.includes('auto_tab_group')) type = 'briefing';
            else if (lowIcon.includes('cards_star')) type = 'cards';
            else if (lowIcon.includes('quiz')) type = 'quiz';
            else if (lowIcon.includes('stacked_bar_chart')) type = 'infographic';
            else if (lowIcon.includes('table_view')) type = 'table';

            // Identify System Artifacts (the 9 generators)
            const isSystem = i < 9;

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
                isSystem,
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

/**
 * Ensures the Studio panel is maximized/visible.
 */
export async function maximizeStudioAction(
    ctx: UniversalContext,
    deps: NotebookLMActionDeps
): Promise<void> {
    const { page, log } = ctx;
    const { selectors } = deps;

    const studioBtn = page.locator('button').filter({ hasText: /Notebook Guide|Studio|Průvodce/i }).first();
    const expandBtn = page.locator(`${selectors.studio.expandButtonCs}, ${selectors.studio.expandButtonEn}, ${selectors.studio.maximizeButton}`).first();
    
    if (await expandBtn.count() > 0 && await expandBtn.isVisible()) {
        log('Expanding Studio panel via aria-label...');
        await expandBtn.click();
        await deps.humanDelay(2000);
    } else if (await studioBtn.count() > 0 && await studioBtn.isVisible()) {
        log('Maximizing Studio panel via text...');
        await studioBtn.click();
        await deps.humanDelay(2000);
    }
}

/**
 * Renames an artifact in the studio panel.
 */
export async function renameStudioArtifactAction(
    ctx: UniversalContext,
    deps: NotebookLMActionDeps,
    oldTitle: string,
    newTitle: string
): Promise<boolean> {
    const { page, log } = ctx;
    
    log(`Renaming artifact from "${oldTitle}" to "${newTitle}"...`);
    
    await maximizeStudioAction(ctx, deps);
    
    const artifacts = await getStudioArtifactsAction(ctx, deps);
    const index = artifacts.findIndex(a => a.title === oldTitle);
    
    if (index === -1) {
        log(`Artifact "${oldTitle}" not found for renaming.`, 'error');
        return false;
    }

    const studioPanel = page.locator('section.studio-panel, .studio-panel, div.right-panel').first();
    const item = studioPanel.locator('.artifact-stretched-button').nth(index);
    const moreBtn = item.locator('xpath=..').locator('.artifact-more-button, [aria-label*="Možnosti"], [aria-label*="More"]').first();
    
    if (await moreBtn.count() === 0) {
        log('More menu button not found for artifact.', 'error');
        return false;
    }

    await moreBtn.click();
    await deps.humanDelay(1000);

    const renameBtn = page.locator('button[role="menuitem"]').filter({ hasText: /Přejmenovat|Rename/i }).first();
    if (await renameBtn.count() === 0) {
        log('Rename button not found in menu.', 'error');
        await page.keyboard.press('Escape');
        return false;
    }

    await renameBtn.click();
    await deps.humanDelay(500);

    const input = page.locator('input[type="text"], mat-dialog-container input').first();
    await input.fill(newTitle);
    await page.keyboard.press('Enter');
    await deps.humanDelay(1000);

    log(`Successfully renamed artifact to: ${newTitle}`);
    return true;
}
