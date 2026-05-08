import { Router, Request, Response } from 'express';
import { GeminiClient } from '../clients/gemini';
import { BrowserClient } from '../clients/base';
import { config } from '../config';
import { 
    startChatCompletionTrace, 
    completeChatCompletionTrace, 
    failChatCompletionTrace, 
    estimateTokens 
} from '../services/observability';
import { NotebookLMClient } from '../clients/notebooklm';
import { GraphStore } from '../core/graph-store';

export interface NotebookRouterDeps {
    browserClient: BrowserClient;
    graphStore: GraphStore;
    notifyResearchComplete: (title: string, path?: string) => Promise<void>;
}

export function createNotebookRouter(deps: NotebookRouterDeps) {
    const router = Router();
    const { browserClient, graphStore, notifyResearchComplete } = deps;
    let notebookClient: NotebookLMClient | null = null;

    const getNotebookClient = async () => {
        if (!notebookClient) {
            notebookClient = await browserClient.createNotebookLMClient();
        }
        return notebookClient;
    };

    router.post('/list', async (req: Request, res: Response) => {
        try {
            const client = await getNotebookClient();
            const notebooks = await client!.listNotebooks();
            res.json({ success: true, data: notebooks });
        } catch (e: any) {
            console.error('[NotebookRouter] List notebooks failed:', e);
            res.status(500).json({ error: e.message });
        }
    });

    router.post('/create', async (req: Request, res: Response) => {
        try {
            const { title } = req.body;
            if (!title) return res.status(400).json({ error: 'Title is required' });

            console.log(`[NotebookRouter] Creating notebook: ${title}`);
            const client = await getNotebookClient();
            await client!.createNotebook(title);

            res.json({ success: true, message: `Notebook '${title}' created` });
        } catch (e: any) {
            console.error('[NotebookRouter] Create notebook failed:', e);
            res.status(500).json({ success: false, error: e.message });
        }
    });

    router.post('/add-source', async (req: Request, res: Response) => {
        try {
            const { url, notebookTitle } = req.body;
            if (!url) return res.status(400).json({ error: 'URL is required' });

            const client = await getNotebookClient();
            if (notebookTitle) {
                console.log(`[NotebookRouter] Switching to notebook: ${notebookTitle}`);
                await client!.openNotebook(notebookTitle);
            }

            console.log(`[NotebookRouter] Adding source: ${url}`);
            await client!.addSourceUrl(url);

            res.json({ success: true, message: `Source added` });
        } catch (e: any) {
            console.error('[NotebookRouter] Add source failed:', e);
            res.status(500).json({ success: false, error: e.message });
        }
    });

    router.post('/add-drive-source', async (req: Request, res: Response) => {
        try {
            const { docNames, notebookTitle } = req.body;
            if (!docNames || !Array.isArray(docNames) || docNames.length === 0) {
                return res.status(400).json({ success: false, error: 'docNames array is required' });
            }

            const client = await getNotebookClient();
            console.log(`[NotebookRouter] Adding Drive sources: ${docNames.join(', ')}`);
            await client!.addSourceFromDrive(docNames, notebookTitle);

            res.json({ success: true, message: `Drive sources added` });
        } catch (e: any) {
            console.error('[NotebookRouter] Add Drive source failed:', e);
            res.status(500).json({ success: false, error: e.message });
        }
    });

    router.post('/add-text', async (req: Request, res: Response) => {
        try {
            const { notebookTitle, text, sourceTitle } = req.body;
            if (!text || typeof text !== 'string') {
                return res.status(400).json({ success: false, error: 'text (string) is required' });
            }

            const client = await getNotebookClient();
            console.log(`[NotebookRouter] Adding text source (${text.length} chars) to notebook: ${notebookTitle || 'current'}`);
            await client!.addSourceText(text, sourceTitle, notebookTitle);

            res.json({ success: true, message: 'Text source added' });
        } catch (e: any) {
            console.error('[NotebookRouter] Add text source failed:', e);
            res.status(500).json({ success: false, error: e.message });
        }
    });

    router.post('/generate-audio', async (req: Request, res: Response) => {
        try {
            const { notebookTitle, sources, customPrompt, dryRun } = req.body;
            const { getWindmillClient } = await import('../clients/windmill');
            const windmill = getWindmillClient();

            if (!windmill.isConfigured()) {
                console.warn('[NotebookRouter] Windmill not configured, falling back to local execution');
                const client = await getNotebookClient();
                if (client!.isBusy) {
                    return res.status(409).json({ success: false, error: 'NotebookLM client is busy. Use Windmill for queued execution.' });
                }
                const job = await graphStore.addJob('audio-generation', notebookTitle || 'default', { sources, customPrompt, dryRun });
                (async () => {
                    try {
                        await graphStore.updateJobStatus(job.id, 'running');
                        await client!.generateAudioOverview(notebookTitle, sources, customPrompt, true, dryRun);
                        await graphStore.updateJobStatus(job.id, 'completed', { result: { message: 'Audio generated' } });
                    } catch (err: any) {
                        await graphStore.updateJobStatus(job.id, 'failed', { error: err.message });
                    }
                })();
                return res.status(202).json({ success: true, message: 'Audio generation started (local fallback)', jobId: job.id });
            }

            console.log(`[NotebookRouter] Queueing ${sources?.length || 0} audio generation(s) via Windmill...`);
            const { queued, failed } = await windmill.queueAudioGenerations(
                notebookTitle || 'default',
                sources || [],
                customPrompt
            );

            res.status(202).json({
                success: queued.length > 0,
                message: `Queued ${queued.length} audio generation(s) via Windmill`,
                jobs: queued.map(j => ({ jobId: j.jobId, source: j.error })),
                failed: failed.length > 0 ? failed : undefined
            });
        } catch (e: any) {
            console.error('[NotebookRouter] Generate audio failed:', e);
            res.status(500).json({ success: false, error: e.message });
        }
    });

    router.post('/audio-status', async (req: Request, res: Response) => {
        try {
            const { notebookTitle } = req.body;
            const client = await getNotebookClient();
            const status = await client!.checkAudioStatus(notebookTitle);
            res.json({ success: true, ...status });
        } catch (e: any) {
            console.error('[NotebookRouter] Audio status failed:', e);
            res.status(500).json({ success: false, error: e.message });
        }
    });

    router.post('/dump', async (req: Request, res: Response) => {
        try {
            const client = await getNotebookClient();
            const paths = await client!.dumpState('manual_dump');
            res.json({ success: true, paths });
        } catch (e: any) {
            console.error('[NotebookRouter] Dump failed:', e);
            res.status(500).json({ success: false, error: e.message });
        }
    });

    router.post('/rename-artifact', async (req: Request, res: Response) => {
        try {
            const { notebookTitle, oldTitle, newTitle } = req.body;
            if (!oldTitle || !newTitle) {
                return res.status(400).json({ success: false, error: 'oldTitle and newTitle are required' });
            }

            const client = await getNotebookClient();
            if (notebookTitle) {
                await client!.openNotebook(notebookTitle);
            }

            const success = await client!.renameArtifact(oldTitle, newTitle);
            res.json({ success });
        } catch (e: any) {
            console.error('[NotebookRouter] Rename artifact failed:', e);
            res.status(500).json({ success: false, error: e.message });
        }
    });

    router.post('/download-artifact', async (req: Request, res: Response) => {
        try {
            const { notebookTitle, artifactTitle, outputPath, isPattern, latestOnly } = req.body;
            if (!notebookTitle || !artifactTitle || !outputPath) {
                return res.status(400).json({ success: false, error: 'notebookTitle, artifactTitle, and outputPath are required' });
            }

            const client = await getNotebookClient();
            const success = await client!.downloadArtifact(notebookTitle, artifactTitle, outputPath, {
                isPattern: isPattern === true || isPattern === 'true',
                latestOnly: latestOnly === true || latestOnly === 'true'
            });

            res.json({ success });
        } catch (e: any) {
            console.error('[NotebookRouter] Download artifact failed:', e);
            res.status(500).json({ success: false, error: e.message });
        }
    });

    return router;
}
