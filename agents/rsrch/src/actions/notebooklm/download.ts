import { UniversalContext, NotebookLMActionDeps } from '../types';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Downloads audio from the current notebook using direct URL extraction or UI fallback.
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

    log(`Attempting reactive download to: ${outputPath}`);
    
    // 1. Ensure Studio is open
    if (deps.maximizeStudio) await deps.maximizeStudio();
    await deps.humanDelay(1000);

    // 2. Try Golden Path: Direct binary streaming from <audio> source
    const audioSrc = await page.evaluate(() => {
        const audioEl = document.querySelector('audio');
        return audioEl ? audioEl.src : null;
    });

    if (audioSrc) {
        if (audioSrc.startsWith('blob:')) {
            log('Detected blob URL. Extracting from memory...');
            const buffer = await page.evaluate(async (url) => {
                const resp = await fetch(url);
                const blob = await resp.blob();
                const arrayBuffer = await blob.arrayBuffer();
                return Array.from(new Uint8Array(arrayBuffer));
            }, audioSrc);
            
            const dir = path.dirname(outputPath);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(outputPath, Buffer.from(buffer));
            log(`Audio extracted from memory to ${outputPath}`);
            return true;
        } else {
            log(`Downloading audio from URL: ${audioSrc}`);
            const response = await page.context().request.get(audioSrc);
            if (response.ok()) {
                const buffer = await response.body();
                const dir = path.dirname(outputPath);
                if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
                fs.writeFileSync(outputPath, buffer);
                log(`Audio successfully saved to ${outputPath}`);
                return true;
            }
        }
    }

    // 3. Fallback: UI-based download via menu
    log('Direct URL path failed. Falling back to UI clicking...');
    
    const audioArtifacts = page.locator('button, div[role="button"]').filter({
        hasText: 'audio_magic_eraser'
    }).filter({ hasText: /play_arrow|more_vert/ });

    if (await audioArtifacts.count() === 0) {
        log('No audio artifacts found in Studio panel.', 'warn');
        return false;
    }

    const artifact = audioArtifacts.first();
    await artifact.scrollIntoViewIfNeeded();
    await artifact.hover();
    await deps.humanDelay(500);

    const menuBtn = artifact.locator('button[aria-label*="More"], button[aria-label*="Další"], button mat-icon:has-text("more_vert")').first();
    if (await menuBtn.count() > 0) {
        await menuBtn.click();
        await deps.humanDelay(800);

        let downloadBtn = page.locator('button[role="menuitem"]').filter({ hasText: /Stáhnout|Download/i }).first();
        if (await downloadBtn.count() === 0) {
            downloadBtn = page.locator('mat-icon').filter({ hasText: 'save_alt' }).locator('xpath=ancestor::button[contains(@role, "menuitem")]').first();
        }

        if (await downloadBtn.count() > 0 && await downloadBtn.isVisible()) {
            const downloadPromise = page.waitForEvent('download', { timeout: 15000 });
            await downloadBtn.click();
            const download = await downloadPromise;
            await download.saveAs(outputPath);
            log(`Successfully downloaded via UI: ${outputPath}`);
            return true;
        }
    }

    log('All audio download methods failed.', 'error');
    return false;
}

/**
 * Downloads a specific artifact (note, faq, briefing, presentation, etc.)
 */
export async function downloadArtifactAction(
    ctx: UniversalContext,
    deps: NotebookLMActionDeps,
    notebookTitle: string,
    artifactTitleOrPattern: string,
    outputPathOrDir: string,
    options: { isPattern?: boolean, latestOnly?: boolean } = {}
): Promise<boolean> {
    const { page, log } = ctx;
    const { openNotebookAction } = await import('./navigation');
    const { getStudioArtifactsAction } = await import('./studio');

    if (notebookTitle) {
        await openNotebookAction(ctx, deps, notebookTitle);
    }

    log(`Downloading artifact matching "${artifactTitleOrPattern}"...`);
    
    if (deps.maximizeStudio) await deps.maximizeStudio();
    await deps.humanDelay(2000);

    const artifacts = await getStudioArtifactsAction(ctx, deps);
    let targetIndex = -1;

    if (options.isPattern) {
        const regex = new RegExp(artifactTitleOrPattern, 'i');
        targetIndex = artifacts.findIndex(a => regex.test(a.title));
    } else {
        targetIndex = artifacts.findIndex(a => a.title.toLowerCase().includes(artifactTitleOrPattern.toLowerCase()));
    }

    if (targetIndex === -1) {
        log(`Artifact matching "${artifactTitleOrPattern}" not found.`, 'error');
        return false;
    }

    const target = artifacts[targetIndex];
    log(`Found target artifact: [${target.type}] "${target.title}"`);

    // Handle Audio type by delegating back to downloadAudioAction
    if (target.type === 'audio') {
        let finalPath = outputPathOrDir;
        if (!path.extname(outputPathOrDir)) {
            const safeTitle = target.title.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 50);
            finalPath = path.join(outputPathOrDir, `Audio_${safeTitle}_${Date.now()}.mp3`);
        }
        return downloadAudioAction(ctx, deps, notebookTitle, finalPath, { audioTitlePattern: target.title });
    }

    // 3. Handle Visual/Text Artifacts
    const studioPanel = page.locator('section.studio-panel, .studio-panel, div.right-panel').first();
    
    // SPECIAL FLOW for Presentations/Tables/Infographics/MindMaps: Try native "Download PDF" from the Sidebar Menu
    const isVisual = ['presentation', 'table', 'infographic', 'mindmap', 'briefing'].includes(target.type);
    if (isVisual) {
        log(`Target is visual (${target.type}). Attempting Sidebar "More" menu download...`);
        const item = studioPanel.locator('.artifact-stretched-button').nth(targetIndex);
        const moreBtn = item.locator('xpath=..').locator('.artifact-more-button, [aria-label*="Možnosti"], [aria-label*="More"]').first();
        
        if (await moreBtn.count() > 0) {
            await moreBtn.click();
            await deps.humanDelay(1000);
            
            const downloadBtn = page.locator('button.mat-mdc-menu-item, [role="menuitem"]').filter({ 
                hasText: /Stáhnout dokument PDF|Download PDF|Stáhnout PowerPoint|Download PowerPoint|Exportovat/i 
            }).first();
            
            if (await downloadBtn.count() > 0 && await downloadBtn.isVisible()) {
                const downloadPromise = page.waitForEvent('download', { timeout: 30000 });
                await downloadBtn.click();
                const download = await downloadPromise;
                const finalPath = !path.extname(outputPathOrDir) ? path.join(outputPathOrDir, download.suggestedFilename()) : outputPathOrDir;
                await download.saveAs(finalPath);
                log(`Downloaded visual artifact to: ${finalPath}`);
                return true;
            }
            await page.keyboard.press('Escape');
        }
    }

    // 4. STANDARD FLOW: Open and Scrape/Screenshot
    const itemLocator = studioPanel.locator('.artifact-stretched-button').nth(targetIndex);
    await itemLocator.click({ force: true }).catch(() => itemLocator.dispatchEvent('click'));
    await deps.humanDelay(2500);

    const contentSelector = '.prose, .note-content, .artifact-content-container, article, note-editor, labs-tailwind-doc-viewer, [contenteditable="true"], .ql-editor';
    const textContent = await page.locator(contentSelector).first().allInnerTexts().then(texts => texts.join('\n')).catch(() => '');

    let isDir = false;
    try { isDir = fs.statSync(outputPathOrDir).isDirectory(); } catch(e) { isDir = !path.extname(outputPathOrDir); }

    if (!textContent || textContent.trim().length < 10) {
        log('No extractable text found. Capturing visual screenshot...');
        if (isDir) {
            const safeTitle = target.title.replace(/[^a-zA-Z0-9-_]/g, '_').substring(0, 50);
            const finalPngPath = path.join(outputPathOrDir, `${target.type}_${safeTitle}.png`);
            const container = page.locator('mat-dialog-container, note-editor, .side-panel-content, labs-tailwind-doc-viewer').first();
            if (await container.count() > 0) await container.screenshot({ path: finalPngPath });
            else await page.screenshot({ path: finalPngPath });
            log(`Saved screenshot to: ${finalPngPath}`);
            return true;
        }
    } else {
        let finalPath = outputPathOrDir;
        if (isDir) {
            const safeTitle = target.title.replace(/[^a-zA-Z0-9-_]/g, '_').substring(0, 50);
            finalPath = path.join(outputPathOrDir, `${target.type}_${safeTitle}.txt`);
        }
        const dir = path.dirname(finalPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(finalPath, textContent);
        log(`Saved text artifact to: ${finalPath}`);
        return true;
    }

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
    const textArtifacts = artifacts.filter(a => !a.isSystem && a.type !== 'audio');

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
        const success = await downloadArtifactAction(ctx, deps, '', artifact.title, resolvedOutputDir);
        if (success) successCount++;
    }

    return { success: successCount, skipped: skippedCount };
}
