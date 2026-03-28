import { Router, Request, Response } from 'express';
import { GeminiClient } from '../clients/gemini';
import { PerplexityClient } from '../clients/base';
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
    perplexityClient: PerplexityClient;
    graphStore: GraphStore;
    notifyResearchComplete: (title: string, path?: string) => Promise<void>;
}

export function createNotebookRouter(deps: NotebookRouterDeps) {
    const router = Router();
    const { perplexityClient, graphStore, notifyResearchComplete } = deps;
    let notebookClient: NotebookLMClient | null = null;

    const getNotebookClient = async () => {
        if (!notebookClient) {
            notebookClient = await perplexityClient.createNotebookClient();
        }
        return notebookClient;
    };

    router.post('/list', async (req: Request, res: Response) => {
        try {
            const client = await getNotebookClient();
            const notebooks = await client!.listNotebooks();
            res.json(notebooks);
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

    return router;
}

export function createNotebookLMRouter(deps: NotebookRouterDeps) {
    const router = Router();
    const { graphStore, notifyResearchComplete } = deps;

    router.post('/create-audio-from-doc', async (req: Request, res: Response) => {
        try {
            const { researchDocId, notebookTitle, dryRun } = req.body;
            if (!researchDocId) return res.status(400).json({ error: 'researchDocId is required' });

            const existingAudio = await graphStore.getAudioForResearchDoc(researchDocId);
            if (existingAudio && !dryRun) {
                return res.json({ success: true, audio: existingAudio, cached: true });
            }

            const lineage = await graphStore.getLineage(researchDocId);
            const docNode = lineage.find(n => n.type === 'ResearchDoc' || n.type === 'Document');
            if (!docNode) return res.status(404).json({ error: 'ResearchDoc not found' });

            const { getWindmillClient } = await import('../clients/windmill');
            const windmill = getWindmillClient();

            if (windmill.isConfigured()) {
                const { queued, failed, pendingAudios } = await windmill.queueAudioGenerations(
                    notebookTitle || `Research Audio: ${docNode.title}`,
                    [docNode.title],
                    undefined
                );

                if (queued.length > 0) {
                    return res.status(202).json({
                        success: true,
                        message: 'Audio generation queued via Windmill',
                        jobId: queued[0].jobId,
                        pendingAudioId: pendingAudios[0]?.id
                    });
                }
                return res.status(500).json({ success: false, error: failed[0]?.error || 'Failed to queue job' });
            }

            return res.status(503).json({ error: 'Windmill not configured and async architecture is required.' });
        } catch (e: any) {
            console.error('[NotebookLMRouter] Create audio from doc failed:', e);
            res.status(500).json({ success: false, error: e.message });
        }
    });

    return router;
}

export function createWebhookRouter(deps: { graphStore: GraphStore; notifyResearchComplete: any }) {
    const router = Router();
    const { graphStore, notifyResearchComplete } = deps;

    router.post('/audio-complete', async (req: Request, res: Response) => {
        try {
            const { jobId, status, audioPath, error, notebookTitle, resultAudioId } = req.body;
            console.log(`[Webhook] Audio complete received: ${status} for job ${jobId}`);

            const pendingAudio = await graphStore.getPendingAudioByWindmillJobId(jobId);
            if (!pendingAudio) {
                return res.status(404).json({ error: 'PendingAudio not found' });
            }

            await graphStore.updatePendingAudioStatus(pendingAudio.id, status, { error, resultAudioId });

            if (status === 'completed') {
                await notifyResearchComplete(notebookTitle || pendingAudio.notebookTitle, audioPath);
            } else if (status === 'failed') {
                await notifyResearchComplete(`${notebookTitle || pendingAudio.notebookTitle} (Failed)`, undefined);
            }

            res.json({ success: true });
        } catch (e: any) {
            console.error('[WebhookRouter] Audio complete failed:', e);
            res.status(500).json({ error: e.message });
        }
    });

    return router;
}
