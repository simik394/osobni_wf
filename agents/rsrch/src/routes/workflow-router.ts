import { Router, Request, Response } from 'express';
import { BrowserClient } from '../clients/base';
import { GeminiClient } from '../clients/gemini';
import { NotebookLMClient } from '../clients/notebooklm';
import { GraphStore } from '../core/graph-store';
import { getRegistry } from '../core/artifact-registry';
import { discordService } from '../services/notification';

export interface WorkflowRouterDeps {
    browserClient: BrowserClient;
    graphStore: GraphStore;
}

export function createWorkflowRouter(deps: WorkflowRouterDeps) {
    const router = Router();
    const { browserClient, graphStore } = deps;
    let notebookClient: NotebookLMClient | null = null;
    let activeGeminiClient: GeminiClient | null = null;

    router.post('/research-to-podcast', async (req: Request, res: Response) => {
        try {
            const { query, customPrompt, dryRun } = req.body;
            if (!query) return res.status(400).json({ error: 'Query is required' });

            const job = await graphStore.addJob('research-to-podcast', query, { customPrompt, dryRun });
            console.log(`[WorkflowRouter] Starting Unified Research Job ${job.id} for: "${query}"`);

            res.status(202).json({
                success: true,
                message: 'Unified research flow started',
                jobId: job.id,
                statusUrl: `/jobs/${job.id}`
            });

            // Async Processing
            (async () => {
                try {
                    await graphStore.updateJobStatus(job.id, 'running');
                    await discordService.notifyJobCompletion(job.id, 'Unified Flow Started', query, true, 'Starting automated research pipeline...');

                    const registry = getRegistry();

                    // 1. Perplexity Research
                    console.log(`[Job ${job.id}] Step 1: Perplexity Research`);
                    const pxResult = await browserClient.query(query, { deepResearch: false });
                    if (!pxResult || !pxResult.answer) throw new Error('Perplexity query returned no answer.');

                    // 2. Gemini Deep Research
                    console.log(`[Job ${job.id}] Step 2: Gemini Deep Research`);
                    if (!activeGeminiClient) {
                        activeGeminiClient = await browserClient.createGeminiClient();
                        await activeGeminiClient.init();
                    }

                    const geminiSessionId = await activeGeminiClient.getCurrentSessionId();
                    const sessionId = registry.registerSession(geminiSessionId || 'unknown', query);

                    const combinedQuery = `
Please perform a generic Deep Research on the topic: "${query}".
I have already gathered some initial findings from another source (Perplexity):
"""
${pxResult.answer}
"""
Please use your Deep Research capabilities to expand on this...`;
                    await activeGeminiClient.research(combinedQuery);

                    // 3. Export to Docs
                    console.log(`[Job ${job.id}] Step 3: Export to Google Docs`);
                    const exportResult = await activeGeminiClient.exportCurrentToGoogleDocs();
                    const { docTitle, docUrl, docId: googleDocId } = exportResult;
                    if (!docTitle) throw new Error('Failed to export Gemini research to Google Docs.');

                    const docId = registry.registerDocument(sessionId, googleDocId || 'unknown', docTitle);
                    if (googleDocId) {
                        const newDocTitle = `${docId} ${docTitle}`;
                        await activeGeminiClient.renameGoogleDoc(googleDocId, newDocTitle);
                        registry.updateTitle(docId, newDocTitle);
                    }

                    // 4. NotebookLM Setup
                    console.log(`[Job ${job.id}] Step 4: NotebookLM Import`);
                    if (!notebookClient) {
                        notebookClient = await browserClient.createNotebookLMClient();
                    }
                    const safeTitle = query.replace(/[^a-zA-Z0-9 ]/g, '').substring(0, 50).trim() || 'Research Podcast';
                    await notebookClient.createNotebook(safeTitle);
                    await notebookClient.addSourceFromDrive([googleDocId ? `${docId} ${docTitle}` : docTitle]);

                    // 5. Generate Audio
                    console.log(`[Job ${job.id}] Step 5: Audio Generation`);
                    const audioPrompt = customPrompt || "Create a deep, engaging conversation about this research.";
                    const genResult = await notebookClient.generateAudioOverview(safeTitle, undefined, audioPrompt, true, dryRun);
                    const generatedTitle = genResult.artifactTitle || 'Audio Overview';

                    // 6. Download Audio
                    if (!dryRun) {
                        console.log(`[Job ${job.id}] Step 6: Download Audio`);
                        const audioId = registry.registerAudio(docId, safeTitle, 'Audio Overview');
                        const cleanFilename = `${audioId}.mp3`;
                        await notebookClient.downloadAudio(safeTitle, cleanFilename, { audioTitlePattern: generatedTitle });
                        registry.updateLocalPath(audioId, cleanFilename);
                        
                        const newAudioTitle = `${audioId} Audio Overview`;
                        if (generatedTitle !== newAudioTitle) {
                            await notebookClient.renameArtifact(generatedTitle, newAudioTitle);
                        }
                    }

                    await graphStore.updateJobStatus(job.id, 'completed', { result: { docTitle, docUrl, audioGenerated: true, sessionId, docId } });
                    await discordService.notifyJobCompletion(job.id, 'Unified Flow Completed', query, true, `Podcast generated for "${query}".`);

                } catch (err: any) {
                    console.error(`[WorkflowRouter] Job ${job.id} failed:`, err);
                    await graphStore.updateJobStatus(job.id, 'failed', { error: err.message });
                    await discordService.notifyJobCompletion(job.id, 'Unified Flow Failed', query, false, err.message);
                }
            })();
        } catch (e: any) {
            console.error('[WorkflowRouter] Unified research request failed:', e);
            res.status(500).json({ success: false, error: e.message });
        }
    });

    router.post('/jules/publish-session', async (req: Request, res: Response) => {
        const { sessionId, mode = 'pr', waitForCompletion = true } = req.body;
        if (!sessionId) return res.status(400).json({ success: false, error: 'sessionId is required' });

        const performPublish = async (sId: string, m: 'pr' | 'branch') => {
            console.log(`[Jules Automation] Publishing session ${sId} (mode: ${m})...`);
            try {
                // Lease a tab from the shared browser client
                const page = await browserClient.getTabPage('jules');
                await page.goto(`https://jules.google.com/session/${sId}`, { waitUntil: 'networkidle', timeout: 60000 });
                await page.waitForTimeout(2000);

                const publishButton = page.locator('button').filter({ hasText: /^Publish$/i }).first();
                if (!(await publishButton.isVisible())) {
                    if (await page.locator('a[href*="github.com"][href*="/pull/"]').isVisible()) return { success: true };
                    throw new Error('Publish button not found');
                }

                await publishButton.click();
                await page.waitForTimeout(1000);

                const option = m === 'pr' ? /Publish PR/i : /Publish Branch/i;
                await page.locator('button, div, li').filter({ hasText: option }).first().click();
                await page.waitForTimeout(1000);

                await page.locator('button').filter({ hasText: /Confirm|Submit|Publish/i }).first().click();
                await page.waitForSelector('a[href*="github.com"][href*="/pull/"]', { timeout: 30000 });

                return { success: true };
            } catch (e: any) {
                console.error(`[Jules Automation] Publish failed for ${sId}:`, e.message);
                return { success: false, error: e.message };
            } finally {
                // Explicitly release the page back to the TabPool
                await browserClient.release();
            }
        };

        if (!waitForCompletion) {
            performPublish(sessionId, mode).catch(() => {});
            return res.status(202).json({ success: true, message: 'Publishing started in background' });
        }

        const result = await performPublish(sessionId, mode);
        if (result.success) res.json({ success: true, message: 'Session published' });
        else res.status(500).json({ success: false, error: result.error });
    });

    return router;
}
