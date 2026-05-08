import { UniversalContext, NotebookLMActionDeps } from '../types';

export async function generateAudioOverviewAction(
    ctx: UniversalContext,
    options: {
        notebookTitle?: string;
        sources?: string[];
        customPrompt?: string;
        waitForCompletion?: boolean;
        dryRun?: boolean;
    },
    deps: NotebookLMActionDeps
): Promise<{ success: boolean; artifactTitle?: string }> {
    const { notebookTitle, sources, customPrompt, waitForCompletion = false, dryRun = false } = options;
    const { page, log } = ctx;

    // Orchestrator actions require these dependencies to be present
    const enqueueTask = deps.enqueueTask!;
    const getIsBusy = deps.getIsBusy!;
    const setIsBusy = deps.setIsBusy!;
    const openNotebook = deps.openNotebook!;
    const recycle = deps.recycle;
    const humanDelay = deps.humanDelay!;
    const getAudioArtifactTitles = deps.getAudioArtifactTitles!;
    const selectSources = deps.selectSources!;
    const maximizeStudio = deps.maximizeStudio!;
    const triggerAudioGeneration = deps.triggerAudioGeneration!;
    const waitForGeneration = deps.waitForGeneration!;
    const renameArtifact = deps.renameArtifact!;

    return enqueueTask(`Generate Audio: ${notebookTitle}`, async () => {
        if (getIsBusy()) {
            log('[NotebookLM] Client marked as busy inside queue. Nested call?', 'warn');
        }
        setIsBusy(true);
        try {
            if (notebookTitle) {
                await openNotebook(notebookTitle);
            } else if (recycle) {
                await recycle();
                await humanDelay(2000);
            } else {
                log('[DEBUG] No notebook specified, ensuring we are on home page (manual fallback)...');
                const currentUrl = page.url();
                if (!currentUrl.includes('notebooklm.google.com') || currentUrl.includes('/notebook/')) {
                    const homeBtn = page.locator('a[href="/"], .notebook-logo, [aria-label*="NotebookLM"]').first();
                    if (await homeBtn.count() > 0 && await homeBtn.isVisible()) {
                        await homeBtn.click();
                        try {
                            await page.waitForURL(url => url.href.includes('notebooklm.google.com') && !url.href.includes('/notebook/'), { timeout: 5000 });
                        } catch (e) {
                            await page.goto(ctx.config.urls.notebooklm, { waitUntil: 'domcontentloaded' });
                        }
                    } else {
                        await page.goto(ctx.config.urls.notebooklm, { waitUntil: 'domcontentloaded' });
                    }
                }
                await humanDelay(2000);
            }

            const existingAudioTitles = await getAudioArtifactTitles();
            log(`[DEBUG] Existing audio artifacts: [${existingAudioTitles.join(', ')}]`);

            if (sources && sources.length > 0) {
                log(`[DEBUG] Selecting sources: ${sources.join(', ')}`);
                await selectSources(sources);
            }

            await maximizeStudio();
            await humanDelay(500);

            const triggered = await triggerAudioGeneration(customPrompt, dryRun);

            if (!triggered) {
                return { success: false, artifactTitle: undefined };
            }

            if (dryRun) return { success: true };

            if (waitForCompletion) {
                await waitForGeneration();
                
                const postGenTitles = await getAudioArtifactTitles();
                const newArtifacts = postGenTitles.filter(t => !existingAudioTitles.includes(t));

                if (newArtifacts.length === 1) {
                    const newTitle = newArtifacts[0];
                    log(`Identified new audio artifact: "${newTitle}"`);

                    const uniqueName = `Audio ${new Date().toISOString().slice(0, 19).replace('T', ' ')}` + (customPrompt ? ' - Custom' : '');
                    await renameArtifact(newTitle, uniqueName);

                    return { success: true, artifactTitle: uniqueName };
                } else if (newArtifacts.length > 1) {
                    log(`Multiple new artifacts found: ${newArtifacts.join(', ')}. Renaming first one.`, 'warn');
                    return { success: true, artifactTitle: newArtifacts[0] };
                } else {
                    log('No new artifact title found after generation.', 'warn');
                }
            }

            return { success: true };

        } catch (e: any) {
            log(`[NotebookLM] Error generating audio overview: ${e.message}`, 'error');
            throw e;
        } finally {
            setIsBusy(false);
        }
    });
}

/**
 * Triggers the actual audio generation UI interaction.
 */
export async function triggerAudioGenerationAction(
    ctx: UniversalContext,
    deps: NotebookLMActionDeps,
    customPrompt?: string,
    dryRun: boolean = false
): Promise<boolean> {
    const { page, log } = ctx;
    
    const generateBtn = page.locator('button').filter({ hasText: /Generovat|Generate/i }).first();
    if (await generateBtn.count() === 0 || !(await generateBtn.isVisible())) {
        log('Generate button not found or not visible.', 'error');
        return false;
    }

    if (customPrompt) {
        log(`Applying custom prompt: "${customPrompt}"`);
        const customizeBtn = page.locator('button').filter({ hasText: /Přizpůsobit|Customize/i }).first();
        if (await customizeBtn.count() > 0) {
            await customizeBtn.click();
            await deps.humanDelay(1000);
            const textarea = page.locator('textarea, [contenteditable="true"]').first();
            await textarea.fill(customPrompt);
            await deps.humanDelay(500);
            
            if (dryRun) {
                log('Dry run: skipping final click.');
                return true;
            }
            
            const submitBtn = page.locator('button').filter({ hasText: /Generovat|Generate/i }).last();
            await submitBtn.click();
        } else {
            log('Customize button not found, falling back to basic generation.', 'warn');
            if (dryRun) return true;
            await generateBtn.click();
        }
    } else {
        if (dryRun) {
            log('Dry run: skipping click.');
            return true;
        }
        await generateBtn.click();
    }

    log('Audio generation triggered.');
    return true;
}

/**
 * Waits for audio generation to complete.
 */
export async function waitForAudioGenerationAction(
    ctx: UniversalContext,
    deps: NotebookLMActionDeps
): Promise<void> {
    const { page, log } = ctx;
    log('Waiting for audio generation to complete (polling)...');

    let attempts = 0;
    const maxAttempts = 120; // 10 minutes approx

    while (attempts < maxAttempts) {
        attempts++;
        const isGenerating = await page.evaluate(() => {
            // 1. Check for explicit progress indicators
            if (document.querySelector('mat-progress-bar, mat-spinner, [role="progressbar"], .loading-indicator')) return true;

            // 2. Check for common generation keywords (broader regex)
            const text = document.body.innerText;
            return /generov|vytvář|generat|creat/i.test(text);
        });

        if (!isGenerating) {
            log('Generation seems complete.');
            return;
        }

        if (attempts % 6 === 0) log(`Still generating... (${attempts * 5}s)`);
        await deps.humanDelay(5000);
    }

    log('Timed out waiting for generation.', 'warn');
}
/**
 * Checks the current status of audio generation in the open notebook.
 */
export async function getAudioGenerationStatusAction(
    ctx: UniversalContext,
    deps: NotebookLMActionDeps
): Promise<{ status: 'idle' | 'generating' | 'ready'; progress?: string }> {
    const { page, log } = ctx;

    try {
        const isGenerating = await page.evaluate(() => {
            const text = document.body.innerText;
            const progress = document.querySelector('mat-progress-bar, mat-spinner, .loading-indicator, .progress-bar');
            const generatingText = /generov|vytvář|generat|creat/i.test(text);
            
            if (progress || generatingText) {
                // Try to extract percentage if visible
                const percentageMatch = text.match(/(\d+)%/);
                return { active: true, progress: percentageMatch ? percentageMatch[0] : undefined };
            }
            return { active: false };
        });

        if (isGenerating.active) {
            return { status: 'generating', progress: isGenerating.progress };
        }

        const artifacts = await getStudioArtifactsAction(ctx, deps);
        const hasAudio = artifacts.some(a => a.type === 'audio');

        return { status: hasAudio ? 'ready' : 'idle' };
    } catch (e: any) {
        log(`Error checking audio status: ${e.message}`, 'error');
        return { status: 'idle' };
    }
}
