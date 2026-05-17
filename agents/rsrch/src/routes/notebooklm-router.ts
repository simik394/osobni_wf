import { Router, Request, Response } from 'express';
import { NotebookLMClient } from '../clients/notebooklm';
import { BrowserClient } from '../clients/base';
import { GraphStore } from '../core/graph-store';

export interface NotebookRouterDeps {
    browserClient: BrowserClient;
    graphStore: GraphStore;
    notifyResearchComplete: (title: string, path?: string) => Promise<void>;
}

export function createNotebookLMRouter(deps: NotebookRouterDeps) {
    const router = Router();
    const { browserClient } = deps;

    const getClient = async () => {
        return await browserClient.createNotebookLMClient();
    };

    router.get('/list', async (req: Request, res: Response) => {
        try {
            const client = await getClient();
            const notebooks = await client.listNotebooks();
            res.json({ success: true, notebooks });
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    });

    router.post('/chat', async (req: Request, res: Response) => {
        try {
            const { notebookTitle, message, sources } = req.body;
            const client = await getClient();
            if (notebookTitle) await client.openNotebook(notebookTitle);
            const response = await client.query(message, { sources });
            res.json({ success: true, response });
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    });

    router.post('/audio', async (req: Request, res: Response) => {
        try {
            const { notebookTitle, sources, prompt, wait } = req.body;
            const client = await getClient();
            const result = await client.generateAudioOverview(notebookTitle, sources, prompt, wait);
            res.json({ ...result });
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    });

    router.post('/presentation', async (req: Request, res: Response) => {
        try {
            const { notebookTitle, sources } = req.body;
            const client = await getClient();
            if (notebookTitle) await client.openNotebook(notebookTitle);
            const success = await client.generatePresentation({ sources });
            res.json({ success });
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    });

    router.post('/infographic', async (req: Request, res: Response) => {
        try {
            const { notebookTitle, sources } = req.body;
            const client = await getClient();
            if (notebookTitle) await client.openNotebook(notebookTitle);
            const success = await client.generateInfographic({ sources });
            res.json({ success });
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    });

    router.post('/create-audio-from-doc', async (req: Request, res: Response) => {
        const { graphStore } = deps;
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
