import express from 'express';
import { PerplexityClient } from './client';
import { config } from './config';

import { NotebookLMClient } from './notebooklm-client';
import { GeminiClient } from './gemini-client';
import { jobQueue, Job } from './job-queue';
import { notifyJobCompleted } from './discord';

const app = express();
const PORT = config.port;

// Middleware
app.use(express.json());

// Initialize the client
const client = new PerplexityClient();
let notebookClient: NotebookLMClient | null = null;

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

// Shutdown endpoint
app.post('/shutdown', async (req, res) => {
    console.log('[Server] Shutdown requested via API');
    res.json({ success: true, message: 'Shutting down...' });

    // Close browser and exit
    try {
        if (notebookClient) {
            // notebookClient doesn't have close, but client.close() handles the browser/context
        }
        await client.close();
    } catch (e) {
        console.error('Error during shutdown cleanup:', e);
    }

    process.exit(0);
});

// Query endpoint
app.post('/query', async (req, res) => {
    try {
        const { query, session, name, deepResearch } = req.body;

        if (!query || typeof query !== 'string') {
            return res.status(400).json({ error: 'Query parameter is required and must be a string' });
        }

        console.log(`[Server] Received query: "${query}" (Session: ${session || 'new'}, Name: ${name || 'none'}, DeepResearch: ${deepResearch || false})`);

        // Non-blocking deep research
        if (deepResearch) {
            const job = jobQueue.add('deepResearch', query, { session, name });
            console.log(`[Server] Deep research job ${job.id} queued.`);

            // Process async
            (async () => {
                try {
                    jobQueue.markRunning(job.id);
                    const result = await client.query(query, { sessionId: session, sessionName: name, deepResearch: true });
                    jobQueue.markCompleted(job.id, result);
                    console.log(`[Server] Deep research job ${job.id} completed.`);
                    notifyJobCompleted(job.id, 'Deep Research', query, true, result?.answer?.substring(0, 100));
                } catch (err: any) {
                    console.error(`[Server] Deep research job ${job.id} failed:`, err);
                    jobQueue.markFailed(job.id, err.message);
                    notifyJobCompleted(job.id, 'Deep Research', query, false, err.message);
                }
            })();

            return res.status(202).json({
                success: true,
                message: 'Deep research started',
                jobId: job.id,
                statusUrl: `/jobs/${job.id}`
            });
        }

        // Synchronous query
        const result = await client.query(query, { sessionId: session, sessionName: name });

        res.json({
            success: true,
            data: result
        });
    } catch (error: any) {
        console.error('[Server] Query failed:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Query execution failed'
        });
    }
});

// NotebookLM Endpoints

app.post('/notebook/create', async (req, res) => {
    try {
        const { title } = req.body;
        if (!title) return res.status(400).json({ error: 'Title is required' });

        console.log(`[Server] Creating notebook: ${title}`);

        // Always create a new client context/page for a new notebook? 
        // Or reuse if one exists but navigate home?
        // The implementation of createNotebook in client navigates home.
        // But separate pages might be better.
        // For now, let's keep one active notebook client.

        if (notebookClient) {
            // Close old one?
            // notebookClient.close? (not implemented)
            // Just overwrite for now
        }

        notebookClient = await client.createNotebookClient();
        await notebookClient.createNotebook(title);

        res.json({ success: true, message: `Notebook '${title}' created` });
    } catch (e: any) {
        console.error('[Server] Create notebook failed:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

app.post('/notebook/add-source', async (req, res) => {
    try {
        const { url, notebookTitle } = req.body;
        if (!url) return res.status(400).json({ error: 'URL is required' });

        if (!notebookClient) {
            // Attempt to create client if not exists
            notebookClient = await client.createNotebookClient();
            // But we need to be in a notebook.
        }

        if (notebookTitle) {
            console.log(`[Server] Switching to notebook: ${notebookTitle}`);
            await notebookClient.openNotebook(notebookTitle);
        } else {
            // Assume already in a notebook or default
            // If we just stared, we might be on home.
            // Ideally we force user to provide title or rely on "active" state.
        }

        console.log(`[Server] Adding source: ${url}`);
        await notebookClient.addSourceUrl(url);

        res.json({ success: true, message: `Source added` });
    } catch (e: any) {
        console.error('[Server] Add source failed:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

app.post('/notebook/add-drive-source', async (req, res) => {
    try {
        const { docNames, notebookTitle } = req.body;

        if (!docNames || !Array.isArray(docNames) || docNames.length === 0) {
            return res.status(400).json({ success: false, error: 'docNames array is required' });
        }

        if (!notebookClient) {
            notebookClient = await client.createNotebookClient();
        }

        console.log(`[Server] Adding Drive sources: ${docNames.join(', ')}`);
        await notebookClient.addSourceFromDrive(docNames, notebookTitle);

        res.json({ success: true, message: `Drive sources added` });
    } catch (e: any) {
        console.error('[Server] Add Drive source failed:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

app.post('/notebook/generate-audio', async (req, res) => {
    try {
        const { notebookTitle, sources, customPrompt, dryRun } = req.body;

        if (!notebookClient) {
            notebookClient = await client.createNotebookClient();
        }

        // Check if busy
        if (notebookClient?.isBusy) {
            return res.status(409).json({ success: false, error: 'NotebookLM client is busy with another task.' });
        }

        // Create Job using centralized queue
        const job = jobQueue.add('audio-generation', notebookTitle || 'default', { sources, customPrompt, dryRun });

        // Start background processing
        console.log(`[Server] Starting async job ${job.id}: Audio Generation (DryRun: ${dryRun})`);

        (async () => {
            try {
                jobQueue.markRunning(job.id);
                await notebookClient!.generateAudioOverview(notebookTitle, sources, customPrompt, true, dryRun);
                jobQueue.markCompleted(job.id, { message: 'Audio generated' });
                console.log(`[Server] Job ${job.id} completed.`);
                notifyJobCompleted(job.id, 'Audio Generation', notebookTitle || 'default', true, 'Audio overview generated');
            } catch (err: any) {
                console.error(`[Server] Job ${job.id} failed:`, err);
                jobQueue.markFailed(job.id, err.message);
                notifyJobCompleted(job.id, 'Audio Generation', notebookTitle || 'default', false, err.message);
            }
        })();

        res.status(202).json({
            success: true,
            message: 'Audio generation started',
            jobId: job.id,
            statusUrl: `/jobs/${job.id}`
        });

    } catch (e: any) {
        console.error('[Server] Generate audio request failed:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

app.get('/jobs/:id', (req, res) => {
    const jobId = req.params.id;
    const job = jobQueue.get(jobId);

    if (!job) {
        return res.status(404).json({ success: false, error: 'Job not found' });
    }

    res.json({ success: true, job });
});

app.get('/jobs', (req, res) => {
    const jobs = jobQueue.list();
    res.json({ success: true, jobs });
});


app.post('/notebook/dump', async (req, res) => {
    try {
        if (!notebookClient) {
            notebookClient = await client.createNotebookClient();
            // Try to existing page?
        }
        console.log('[Server] Dumping state...');
        const paths = await notebookClient.dumpState('manual_dump');
        res.json({ success: true, paths });
    } catch (e: any) {
        console.error('[Server] Dump failed:', e);
    }
});

// Gemini Endpoints
let geminiClient: GeminiClient | null = null;

app.post('/gemini/research', async (req, res) => {
    try {
        const { query } = req.body;
        if (!query) return res.status(400).json({ error: 'Query is required' });

        if (!geminiClient) {
            console.log('[Server] Creating Gemini client...');
            geminiClient = await client.createGeminiClient();
            await geminiClient.init();
        }

        console.log(`[Server] Generating Gemini response for: "${query}"`);
        const response = await geminiClient.research(query);

        res.json({ success: true, data: response });
    } catch (e: any) {
        console.error('[Server] Gemini research failed:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

app.get('/gemini/sessions', async (req, res) => {
    try {
        const limitStr = req.query.limit as string;
        const limit = limitStr ? parseInt(limitStr) : 20;
        const offsetStr = req.query.offset as string;
        const offset = offsetStr ? parseInt(offsetStr) : 0;

        if (!geminiClient) {
            geminiClient = await client.createGeminiClient();
            await geminiClient.init();
        }

        const sessions = await geminiClient.listSessions(limit, offset);
        res.json({ success: true, data: sessions });
    } catch (e: any) {
        console.error('[Server] Gemini list sessions failed:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

app.get('/gemini/list-research-docs', async (req, res) => {
    try {
        const limitStr = req.query.limit as string;
        const limit = limitStr ? parseInt(limitStr) : 10;
        const sessionId = req.query.sessionId as string;

        if (!geminiClient) {
            console.log('[Server] Creating Gemini client...');
            geminiClient = await client.createGeminiClient();
            await geminiClient.init();
        }

        let docs;
        if (sessionId) {
            console.log(`[Server] Listing research docs for session: ${sessionId}`);
            await geminiClient.openSession(sessionId);
            docs = await geminiClient.getAllResearchDocsInSession();
        } else {
            console.log(`[Server] Listing recent research docs (limit: ${limit})...`);
            docs = await geminiClient.listDeepResearchDocuments(limit);
        }

        res.json({ success: true, data: docs });
    } catch (e: any) {
        console.error('[Server] Gemini list research docs failed:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

app.post('/gemini/get-research-info', async (req, res) => {
    try {
        const { sessionId } = req.body;

        if (!geminiClient) {
            geminiClient = await client.createGeminiClient();
            await geminiClient.init();
        }

        if (sessionId) {
            console.log(`[Server] Navigating to session ${sessionId} for research extraction...`);
            await geminiClient.openSession(sessionId);
        }

        const info = await geminiClient.getResearchInfo();
        res.json({ success: true, data: info });
    } catch (e: any) {
        console.error('[Server] Gemini get info failed:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

// Unified Unified Research to Podcast Endpoint
app.post('/research-to-podcast', async (req, res) => {
    try {
        const { query, customPrompt, dryRun } = req.body;

        if (!query) return res.status(400).json({ error: 'Query is required' });

        const job = jobQueue.add('research-to-podcast', query, { customPrompt, dryRun });

        console.log(`[Server] Starting Unified Research Job ${job.id} for: "${query}"`);

        res.status(202).json({
            success: true,
            message: 'Unified research flow started',
            jobId: job.id,
            statusUrl: `/jobs/${job.id}`
        });

        // Async Processing
        (async () => {
            try {
                jobQueue.markRunning(job.id);
                notifyJobCompleted(job.id, 'Unified Flow Started', query, true, 'Starting automated research pipeline...');

                // 1. Perplexity Research (Fast, Grounded)
                console.log(`[Job ${job.id}] Step 1: Perplexity Research`);
                const pxResult = await client.query(query, { deepResearch: false }); // Use standard for speed/grounding

                if (!pxResult || !pxResult.answer) {
                    throw new Error('Perplexity query returned no answer.');
                }
                console.log(`[Job ${job.id}] Perplexity answer length: ${pxResult.answer.length}`);

                // 2. Gemini Deep Research (Reasoning + Synthesis)
                console.log(`[Job ${job.id}] Step 2: Gemini Deep Research`);
                if (!geminiClient) {
                    geminiClient = await client.createGeminiClient();
                    await geminiClient.init();
                }

                const combinedQuery = `
Please perform a generic Deep Research on the topic: "${query}".

I have already gathered some initial findings from another source (Perplexity):
"""
${pxResult.answer}
"""

Please use your Deep Research capabilities to expand on this, verify the information, and produce a comprehensive, well-structured research report. 
Focus on depth, nuance, and covering aspects that might be missing above.
`;
                await geminiClient.research(combinedQuery);

                // 3. Export to Google Docs
                console.log(`[Job ${job.id}] Step 3: Export to Google Docs`);
                // Short wait for generation to ensure export button is ready handled in exportToGoogleDocs logic
                const { docTitle, docUrl } = await geminiClient.exportCurrentToGoogleDocs();

                if (!docTitle) {
                    throw new Error('Failed to export Gemini research to Google Docs (Title not captured).');
                }
                console.log(`[Job ${job.id}] Exported Doc: "${docTitle}" (${docUrl})`);

                // 4. NotebookLM Setup
                console.log(`[Job ${job.id}] Step 4: NotebookLM Import`);
                if (!notebookClient) {
                    notebookClient = await client.createNotebookClient();
                }

                // Create dedicated notebook
                // Sanitize title
                const safeTitle = query.replace(/[^a-zA-Z0-9 ]/g, '').substring(0, 50).trim() || 'Research Podcast';
                await notebookClient.createNotebook(safeTitle);

                // Add Source
                await notebookClient.addSourceFromDrive([docTitle]);

                // 5. Generate Audio Overview
                console.log(`[Job ${job.id}] Step 5: Audio Generation`);
                const audioPrompt = customPrompt || "Create a deep, engaging conversation about this research. Focus on the most surprising findings and the implications.";

                await notebookClient.generateAudioOverview(safeTitle, undefined, audioPrompt, true, dryRun);

                // 6. Download Audio
                if (!dryRun) {
                    console.log(`[Job ${job.id}] Step 6: Download Audio`);
                    const cleanFilename = query.replace(/[^a-z0-9]/gi, '_').toLowerCase().substring(0, 50) + '.mp3';
                    await notebookClient.downloadAudio(safeTitle, cleanFilename);
                    console.log(`[Job ${job.id}] Audio saved to: ${cleanFilename}`);
                } else {
                    console.log(`[Job ${job.id}] Step 6: Skipped Download (Dry Run)`);
                }

                jobQueue.markCompleted(job.id, { docTitle, docUrl, audioGenerated: true });
                notifyJobCompleted(job.id, 'Unified Flow Completed', query, true, `Podcast generated for "${query}". Doc: ${docTitle}`);

            } catch (err: any) {
                console.error(`[Job ${job.id}] Failed:`, err);
                jobQueue.markFailed(job.id, err.message);
                notifyJobCompleted(job.id, 'Unified Flow Failed', query, false, err.message);
            }
        })();

    } catch (e: any) {
        console.error('[Server] Unified research request failed:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('SIGTERM received, closing browser...');
    await client.close();
    process.exit(0);
});

process.on('SIGINT', async () => {
    console.log('SIGINT received, closing browser...');
    await client.close();
    process.exit(0);
});

// Start server
export async function startServer() {
    try {
        console.log('Initializing Perplexity client...');
        await client.init();

        app.listen(PORT, () => {
            console.log(`\n✓ Perplexity Researcher server running on http://localhost:${PORT}`);
            console.log(`\nEndpoints:`);
            console.log(`  GET  /health - Health check`);
            console.log(`  POST /query  - Submit a query`);
            console.log(`\nExample usage:`);
            console.log(`  curl -X POST http://localhost:${PORT}/query \\`);
            console.log(`       -H "Content-Type: application/json" \\`);
            console.log(`       -d '{"query":"What is the capital of France?"}'`);
            console.log();
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}


// Check if run directly
if (require.main === module) {
    startServer();
}
