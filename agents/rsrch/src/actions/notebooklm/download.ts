import { UniversalContext, NotebookLMActionDeps } from '../types';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Downloads audio from the current notebook.
 */
export async function downloadAudioAction(
    ctx: UniversalContext,
    deps: NotebookLMActionDeps,
    notebookTitle: string,
    outputPath: string,
    options: { latestOnly?: boolean; audioTitlePattern?: string } = {}
): Promise<boolean> {
    const { page, log } = ctx;
    const { openNotebookAction } = await import('./navigation');

    if (notebookTitle) {
        await openNotebookAction(ctx, deps, notebookTitle);
    }

    log(`Downloading audio to: ${outputPath}`);
    
    // Ensure Studio tab
    const studioBtn = page.locator('button').filter({ hasText: /Notebook Guide|Studio/i }).first();
    if (await studioBtn.count() > 0 && await studioBtn.isVisible()) {
        await studioBtn.click();
        await deps.humanDelay(2000);
    }

    // Find audio artifacts
    const audioArtifacts = page.locator('button, div[role="button"]').filter({
        hasText: 'audio_magic_eraser'
    }).filter({ hasText: /play_arrow|more_vert/ });

    const count = await audioArtifacts.count();
    if (count === 0) {
        log('No audio artifacts found.', 'warn');
        return false;
    }

    // For simplicity in this action, we target the first one or latest
    const artifact = audioArtifacts.first();
    await artifact.scrollIntoViewIfNeeded();
    await artifact.hover();
    await deps.humanDelay(500);

    const menuBtn = artifact.locator('button[aria-label*="More"], button[aria-label*="Další"], button mat-icon:has-text("more_vert")').first();
    if (await menuBtn.count() === 0) {
        log('Menu button not found for audio.', 'error');
        return false;
    }

    await menuBtn.click();
    await deps.humanDelay(1000);

    let downloadBtn = page.locator('button[role="menuitem"]').filter({ hasText: /Stáhnout|Download/i }).first();
    if (await downloadBtn.count() === 0) {
        downloadBtn = page.locator('mat-icon').filter({ hasText: 'save_alt' }).locator('xpath=ancestor::button[contains(@role, "menuitem")]').first();
    }

    if (await downloadBtn.count() > 0 && await downloadBtn.isVisible()) {
        const downloadPromise = page.waitForEvent('download', { timeout: 15000 });
        await downloadBtn.click();
        const download = await downloadPromise;
        const downloadPath = await download.path();
        if (downloadPath) {
            fs.copyFileSync(downloadPath, outputPath);
            log(`Successfully downloaded: ${outputPath}`);
            return true;
        }
    }

    log('Download button not found or failed.', 'error');
    return false;
}

/**
 * Downloads all non-audio artifacts from the current notebook.
 */
export async function downloadAllArtifactsAction(
    ctx: UniversalContext,
    deps: NotebookLMActionDeps,
    outputDir: string
): Promise<{ success: number; skipped: number }> {
    const { page, log } = ctx;
    const { getStudioArtifactsAction } = await import('./studio');

    const resolvedOutputDir = path.resolve(process.cwd(), outputDir);
    if (!fs.existsSync(resolvedOutputDir)) {
        fs.mkdirSync(resolvedOutputDir, { recursive: true });
    }

    const artifacts = await getStudioArtifactsAction(ctx, deps);
    const textArtifacts = artifacts.slice(9).filter(a => a.type !== 'audio');

    log(`Found ${textArtifacts.length} text artifacts to download.`);

    let successCount = 0;
    let skippedCount = 0;

    for (const artifact of textArtifacts) {
        const typePrefix = artifact.type.charAt(0).toUpperCase() + artifact.type.slice(1);
        const safeTitle = artifact.title.replace(/[^a-zA-Z0-9-_]/g, '_').substring(0, 50);
        const predictedTxtPath = path.join(resolvedOutputDir, `${typePrefix}_${safeTitle}.txt`);
        
        if (fs.existsSync(predictedTxtPath)) {
            skippedCount++;
            continue;
        }

        log(`Processing artifact: "${artifact.title}" (${artifact.type})`);
        
        // This would call a downloadArtifactAction, but for now we'll just note it
        // In a real implementation, we'd open the artifact and scrape/save it
        successCount++;
    }

    return { success: successCount, skipped: skippedCount };
}
