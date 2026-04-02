import { UniversalContext } from '../types';

export async function generateAudioOverviewAction(
    ctx: UniversalContext,
    options: {
        notebookTitle?: string;
        sources?: string[];
        customPrompt?: string;
        waitForCompletion?: boolean;
        dryRun?: boolean;
    },
    deps: {
        enqueueTask: <T>(name: string, task: () => Promise<T>) => Promise<T>;
        setIsBusy: (busy: boolean) => void;
        getIsBusy: () => boolean;
        openNotebook: (title: string) => Promise<void>;
        getAudioArtifactTitles: () => Promise<string[]>;
        selectSources: (sourcesOrRange: string | string[]) => Promise<void>;
        maximizeStudio: () => Promise<void>;
        triggerAudioGeneration: (customPrompt?: string, dryRun?: boolean, notebookTitle?: string) => Promise<boolean>;
        waitForGeneration: () => Promise<void>;
        renameArtifact: (oldTitle: string, newTitle: string) => Promise<boolean>;
        humanDelay: (baseMs: number, variance?: number) => Promise<void>;
    }
): Promise<{ success: boolean; artifactTitle?: string }> {
    const { notebookTitle, sources, customPrompt, waitForCompletion = false, dryRun = false } = options;
    const { page, log } = ctx;

    return deps.enqueueTask(`Generate Audio: ${notebookTitle}`, async () => {
        if (deps.getIsBusy()) {
            console.warn('[NotebookLM] Client marked as busy inside queue. Nested call?');
        }
        deps.setIsBusy(true);
        try {
            if (notebookTitle) {
                await deps.openNotebook(notebookTitle);
            } else {
                log('[DEBUG] No notebook specified, ensuring we are on home page...');
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
                await deps.humanDelay(2000);
            }

            const existingAudioTitles = await deps.getAudioArtifactTitles();
            log(`[DEBUG] Existing audio artifacts: [${existingAudioTitles.join(', ')}]`);

            if (sources && sources.length > 0) {
                log(`[DEBUG] Selecting sources: ${sources.join(', ')}`);
                await deps.selectSources(sources);
            }

            await deps.maximizeStudio();
            await deps.humanDelay(500);

            const triggered = await deps.triggerAudioGeneration(customPrompt, dryRun, notebookTitle);

            if (!triggered) {
                return { success: false, artifactTitle: undefined };
            }

            if (dryRun) return { success: true };

            if (waitForCompletion) {
                await deps.waitForGeneration();
                
                const postGenTitles = await deps.getAudioArtifactTitles();
                const newArtifacts = postGenTitles.filter(t => !existingAudioTitles.includes(t));

                if (newArtifacts.length === 1) {
                    const newTitle = newArtifacts[0];
                    console.log(`[DEBUG] Identified new audio artifact: "${newTitle}"`);

                    const uniqueName = `Audio ${new Date().toISOString().slice(0, 19).replace('T', ' ')}` + (customPrompt ? ' - Custom' : '');
                    await deps.renameArtifact(newTitle, uniqueName);

                    return { success: true, artifactTitle: uniqueName };
                } else if (newArtifacts.length > 1) {
                    console.warn(`[DEBUG] Multiple new artifacts found: ${newArtifacts.join(', ')}. Renaming first one.`);
                    return { success: true, artifactTitle: newArtifacts[0] };
                } else {
                    console.warn('[DEBUG] No new artifact title found after generation.');
                }
            }

            return { success: true };

        } catch (e: any) {
            console.error('[NotebookLM] Error generating audio overview:', e.message);
            throw e;
        } finally {
            deps.setIsBusy(false);
        }
    });
}
