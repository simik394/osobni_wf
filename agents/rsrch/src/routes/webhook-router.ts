import { Router, Request, Response } from 'express';
import { GraphStore } from '../core/graph-store';

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
