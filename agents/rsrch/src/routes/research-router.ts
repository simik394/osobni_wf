import { Router, Request, Response } from 'express';
import { GeminiClient } from '../clients/gemini';
import { BrowserClient } from '../clients/base';
import { GraphStore } from '../core/graph-store';
import { markTabBusy, markTabFree } from '@agents/shared/tab-pool';
import { discordService } from '../services/notification';

export interface ResearchRouterDeps {
    browserClient: BrowserClient;
    graphStore: GraphStore;
}

export function createResearchRouter(deps: ResearchRouterDeps) {
    const router = Router();
    const { browserClient, graphStore } = deps;

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
                    jobClient = await browserClient.createGeminiClient();
                    page = (jobClient as any).page;
                    await markTabBusy(page, job.id);

                    await jobClient.init();
                    await jobClient.resetToNewChat();

                    const result = await jobClient.startDeepResearch(query, gem);
                    await graphStore.updateJobStatus(job.id, 'completed', { result });

                    await discordService.notifyJobCompletion(job.id, 'Deep Research', query, true, result.docUrl || undefined, result.docUrl || undefined);
                } catch (e: any) {
                    console.error(`[ResearchRouter] Job ${job.id} failed:`, e);
                    await graphStore.updateJobStatus(job.id, 'failed', { error: e.message });
                    await discordService.notifyJobCompletion(job.id, 'Deep Research', query, false, e.message);
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

    // --- Job Listing ---
    router.get('/jobs', async (req: Request, res: Response) => {
        const jobs = await graphStore.listJobs();
        res.json({ success: true, jobs });
    });

    // --- Graph Status ---
    router.get('/graph/status', async (req: Request, res: Response) => {
        try {
            const jobs = await graphStore.listJobs();
            const stats = {
                total: jobs.length,
                queued: jobs.filter(j => j.status === 'queued').length,
                running: jobs.filter(j => j.status === 'running').length,
                completed: jobs.filter(j => j.status === 'completed').length,
                failed: jobs.filter(j => j.status === 'failed').length
            };
            res.json({ success: true, stats });
        } catch (e: any) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    return router;
}

export const createJobRouter = (deps: { graphStore: GraphStore }) => {
    const router = Router();
    router.get('/', async (req, res) => {
        const jobs = await deps.graphStore.listJobs();
        res.json({ success: true, jobs });
    });
    return router;
};
