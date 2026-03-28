import { Router, Request, Response } from 'express';
import { GeminiClient } from '../gemini-client';
import { PerplexityClient } from '../client';
import { GraphStore } from '../graph-store';
import { markTabBusy, markTabFree } from '@agents/shared/tab-pool';
import { discordService } from '../services/notification';
import { notifyJobCompleted } from '../discord';

export interface ResearchRouterDeps {
    perplexityClient: PerplexityClient;
    graphStore: GraphStore;
}

export function createResearchRouter(deps: ResearchRouterDeps) {
    const router = Router();
    const { perplexityClient, graphStore } = deps;
    let activeGeminiClient: GeminiClient | null = null;

    router.post('/start', async (req: Request, res: Response) => {
        try {
            const { query, gem, sessionId } = req.body;
            if (!query) return res.status(400).json({ success: false, error: 'Query is required' });

            const job = await graphStore.addJob('deepResearch', query, { gem, sessionId });
            console.log(`[ResearchRouter] Deep research job created: ${job.id}`);

            // Background execution
            (async () => {
                let jobClient: GeminiClient | null = null;
                let page: any = null;
                try {
                    await graphStore.updateJobStatus(job.id, 'running');
                    
                    // Acquire fresh client/tab from pool
                    jobClient = await perplexityClient.createGeminiClient();
                    page = (jobClient as any).page;
                    await markTabBusy(page, job.id);

                    await jobClient.init();
                    await jobClient.resetToNewChat();

                    const result = await jobClient.startDeepResearch(query, gem);
                    await graphStore.updateJobStatus(job.id, 'completed', { result });

                    await discordService.notifyJobCompletion(job.id, 'Deep Research', query, true, result.googleDocUrl);
                    notifyJobCompleted(job.id, 'Deep Research', query, true, result.googleDocTitle);
                } catch (e: any) {
                    console.error(`[ResearchRouter] Job ${job.id} failed:`, e);
                    await graphStore.updateJobStatus(job.id, 'failed', { error: e.message });
                    await discordService.notifyJobCompletion(job.id, 'Deep Research', query, false, e.message);
                    notifyJobCompleted(job.id, 'Deep Research', query, false, e.message);
                } finally {
                    if (page) await markTabFree(page);
                }
            })();

            res.json({ success: true, jobId: job.id, status: 'queued' });
        } catch (e: any) {
            console.error('[ResearchRouter] Failed to start deep research:', e);
            res.status(500).json({ success: false, error: e.message });
        }
    });

    router.get('/status/:id', async (req: Request, res: Response) => {
        const job = await graphStore.getJob(req.params.id);
        if (!job) return res.status(404).json({ success: false, error: 'Job not found' });
        res.json({
            success: true,
            jobId: job.id,
            status: job.status,
            query: job.query,
            createdAt: job.createdAt,
            error: job.error
        });
    });

    router.get('/result/:id', async (req: Request, res: Response) => {
        const job = await graphStore.getJob(req.params.id);
        if (!job) return res.status(404).json({ success: false, error: 'Job not found' });
        if (job.status !== 'completed') return res.status(202).json({ success: false, error: 'Job not completed yet', status: job.status });
        res.json({ success: true, jobId: job.id, result: job.result });
    });

    return router;
}

export function createJobRouter(deps: { graphStore: GraphStore }) {
    const router = Router();
    const { graphStore } = deps;

    router.get('/', async (req: Request, res: Response) => {
        const jobs = await graphStore.listJobs();
        res.json({ success: true, jobs });
    });

    router.get('/:id', async (req: Request, res: Response) => {
        const job = await graphStore.getJob(req.params.id);
        if (!job) return res.status(404).json({ success: false, error: 'Job not found' });
        res.json({ success: true, job });
    });

    return router;
}
