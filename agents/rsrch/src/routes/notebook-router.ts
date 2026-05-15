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
        if (!browserClient.isBrowserInitialized()) {
            console.log('[NotebookRouter] Lazy initializing browser...');
            await browserClient.init();
        }
        if (!notebookClient) {
            notebookClient = await browserClient.createNotebookLMClient();
        }
        return notebookClient;
    };

    router.post('/list', async (req: Request, res: Response) => {
        try {
            const { offset, limit } = req.body;
            const client = await getNotebookClient();
            let notebooks = await client!.listNotebooks();
            
            if (offset !== undefined || limit !== undefined) {
                const start = parseInt(offset as string) || 0;
                const end = limit ? start + parseInt(limit as string) : notebooks.length;
                notebooks = notebooks.slice(start, end);
            }
            
            res.json({ success: true, data: notebooks });
        } catch (e: any) {
            console.error('[NotebookRouter] List notebooks failed:', e);
            res.status(500).json({ success: false, error: e.message });
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

    router.post('/rename', async (req: Request, res: Response) => {
        try {
            const { oldTitle, newTitle } = req.body;
            if (!oldTitle || !newTitle) return res.status(400).json({ error: 'oldTitle and newTitle are required' });

            const client = await getNotebookClient();
            await client!.renameNotebook(oldTitle, newTitle);
            res.json({ success: true, message: `Notebook renamed to '${newTitle}'` });
        } catch (e: any) {
            console.error('[NotebookRouter] Rename notebook failed:', e);
            res.status(500).json({ success: false, error: e.message });
        }
    });

    router.post('/delete', async (req: Request, res: Response) => {
        try {
            const { title } = req.body;
            if (!title) return res.status(400).json({ error: 'Title is required' });

            const client = await getNotebookClient();
            await client!.deleteNotebook(title);
            res.json({ success: true, message: `Notebook '${title}' deleted` });
        } catch (e: any) {
            console.error('[NotebookRouter] Delete notebook failed:', e);
            res.status(500).json({ success: false, error: e.message });
        }
    });

    router.post('/add-source', async (req: Request, res: Response) => {
        try {
            const { url, files, notebookTitle } = req.body;
            const client = await getNotebookClient();

            if (notebookTitle) {
                console.log(`[NotebookRouter] Switching to notebook: ${notebookTitle}`);
                await client!.openNotebook(notebookTitle);
            }

            if (url) {
                console.log(`[NotebookRouter] Adding web source: ${url}`);
                await client!.addSourceUrl(url);
            } else if (files && Array.isArray(files)) {
                console.log(`[NotebookRouter] Processing ${files.length} base64 files...`);
                const fs = await import('fs');
                const path = await import('path');
                const os = await import('os');

                const tempDir = path.join(os.tmpdir(), `rsrch_upload_${Date.now()}`);
                fs.mkdirSync(tempDir, { recursive: true });

                const savedPaths = [];
                for (const file of files) {
                    const filePath = path.join(tempDir, file.filename);
                    fs.writeFileSync(filePath, Buffer.from(file.content, 'base64'));
                    savedPaths.push(filePath);
                }

                console.log(`[NotebookRouter] Uploading files to NotebookLM...`);
                await client!.uploadLocalFile(savedPaths);

                // Cleanup
                for (const p of savedPaths) fs.unlinkSync(p);
                fs.rmdirSync(tempDir);
            } else {
                return res.status(400).json({ error: 'URL or files are required' });
            }

            res.json({ success: true, message: `Source(s) added` });
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

    router.post('/content-preview', async (req: Request, res: Response) => {
        try {
            const { notebookTitle, type } = req.body;
            if (!notebookTitle || !type) return res.status(400).json({ error: 'notebookTitle and type are required' });

            const client = await getNotebookClient();
            await client!.openNotebook(notebookTitle);

            let data: any = [];
            if (type === 'sources') {
                data = await client!.getSourcesPreview();
            } else if (type === 'studio') {
                const artifacts = await client!.getStudioArtifacts();
                data = artifacts;
            } else if (type === 'chat') {
                data = await client!.getChatMessages();
            } else {
                return res.status(400).json({ error: 'Invalid type. Use sources, studio, or chat.' });
            }

            res.json({ success: true, data });
        } catch (e: any) {
            console.error('[NotebookRouter] Content preview failed:', e);
            res.status(500).json({ success: false, error: e.message });
        }
    });

    router.post('/content-download', async (req: Request, res: Response) => {
        try {
            const { notebookTitle, type, indices, outputDir } = req.body;
            if (!notebookTitle || !type) return res.status(400).json({ error: 'notebookTitle and type are required' });

            const client = await getNotebookClient();
            await client!.openNotebook(notebookTitle);

            if (type === 'sources') {
                const sources = await client!.getSources();
                for (let idx = 0; idx < sources.length; idx++) {
                    if (indices && !indices.includes(idx + 1)) continue;
                    await client!.downloadSource(sources[idx].title, outputDir);
                }
            } else if (type === 'studio') {
                const actual = await client!.getStudioArtifacts();
                for (let idx = 0; idx < actual.length; idx++) {
                    if (indices && !indices.includes(idx + 1)) continue;
                    await client!.downloadArtifact(notebookTitle, actual[idx].title, outputDir);
                }
            } else if (type === 'chat') {
                const history = await client!.getChatMessages();
                // We'll handle chat history formatting on the client side or here. 
                // Let's just return the data for now, or handle it here if it's supposed to be a file download.
                // Since the CLI expectes files to be saved, we should save them on the server's disk or return them.
                // However, the CLI command 'get' expects to save locally.
                // If it's a server request, 'outputDir' is likely on the server!
                // Wait, if the user runs the CLI, they want the file LOCALLY.
                // But if they use the server variant, it saves on the server.
                // I'll return the chat history data so the CLI can save it locally if it wants, 
                // OR just follow the pattern where it saves on the server.
                res.json({ success: true, data: history });
                return;
            }

            res.json({ success: true, message: 'Content downloaded successfully' });
        } catch (e: any) {
            console.error('[NotebookRouter] Content download failed:', e);
            res.status(500).json({ error: e.message });
        }
    });

    router.post('/archive', async (req: Request, res: Response) => {
        try {
            const { notebookTitle, outputDir, format, extractSources, incremental } = req.body;
            if (!notebookTitle) return res.status(400).json({ error: 'notebookTitle is required' });

            const client = await getNotebookClient();
            const paths = await client!.archiveNotebook(notebookTitle, { outputDir, format, extractSources, incremental });

            res.json({ success: true, data: paths });
        } catch (e: any) {
            console.error('[NotebookRouter] Archive failed:', e);
            res.status(500).json({ success: false, error: e.message });
        }
    });

    router.post('/rename-source', async (req: Request, res: Response) => {
        try {
            const { notebookTitle, oldTitle, newTitle } = req.body;
            const client = await getNotebookClient();
            await client!.openNotebook(notebookTitle);
            await client!.renameSource(oldTitle, newTitle);
            res.json({ success: true });
        } catch (e: any) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    router.post('/select-sources', async (req: Request, res: Response) => {
        try {
            const { notebookTitle, sourcesOrRange } = req.body;
            const client = await getNotebookClient();
            await client!.openNotebook(notebookTitle);
            await client!.selectSources(sourcesOrRange);
            res.json({ success: true });
        } catch (e: any) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    router.post('/delete-source', async (req: Request, res: Response) => {
        try {
            const { notebookTitle, sourceTitle } = req.body;
            const client = await getNotebookClient();
            await client!.openNotebook(notebookTitle);
            await client!.deleteSource(sourceTitle);
            res.json({ success: true });
        } catch (e: any) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    router.post('/scrape', async (req: Request, res: Response) => {
        try {
            const { notebookTitle, downloadAudio } = req.body;
            if (!notebookTitle) return res.status(400).json({ error: 'notebookTitle is required' });

            const client = await getNotebookClient();
            const data = await client!.scrapeNotebook(notebookTitle, downloadAudio);
            res.json({ success: true, data });
        } catch (e: any) {
            console.error('[NotebookRouter] Scrape failed:', e);
            res.status(500).json({ success: false, error: e.message });
        }
    });

    router.post('/stats', async (req: Request, res: Response) => {
        try {
            const { title } = req.body;
            if (!title) return res.status(400).json({ error: 'title is required' });

            const client = await getNotebookClient();
            const stats = await client!.getNotebookStats(title);
            res.json({ success: true, data: stats });
        } catch (e: any) {
            console.error('[NotebookRouter] Stats failed:', e);
            res.status(500).json({ success: false, error: e.message });
        }
    });

    router.post('/messages', async (req: Request, res: Response) => {
        try {
            const { title } = req.body;
            if (!title) return res.status(400).json({ error: 'title is required' });

            const client = await getNotebookClient();
            await client!.openNotebook(title);
            const messages = await client!.getChatMessages();
            res.json({ success: true, data: messages });
        } catch (e: any) {
            console.error('[NotebookRouter] Messages failed:', e);
            res.status(500).json({ success: false, error: e.message });
        }
    });

    router.post('/ask', async (req: Request, res: Response) => {
        try {
            const { title, message } = req.body;
            if (!title || !message) return res.status(400).json({ error: 'title and message are required' });

            const client = await getNotebookClient();
            await client!.openNotebook(title);
            const response = await client!.query(message);
            res.json({ success: true, data: response });
        } catch (e: any) {
            console.error('[NotebookRouter] Ask failed:', e);
            res.status(500).json({ success: false, error: e.message });
        }
    });

    return router;
}
