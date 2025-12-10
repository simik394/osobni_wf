import express from 'express';
import { PerplexityClient } from './client';
import { config } from './config';

import { NotebookLMClient } from './notebooklm-client';
import { GeminiClient } from './gemini-client';

const app = express();
const PORT = config.port;

// Middleware
app.use(express.json());

// Initialize the client
// Initialize the client
const client = new PerplexityClient();
let notebookClient: NotebookLMClient | null = null;

// Job Management
interface Job {
    id: string;
    type: 'audio-generation';
    status: 'pending' | 'processing' | 'completed' | 'failed';
    result?: any;
    error?: string;
    createdAt: number;
}
const jobs = new Map<string, Job>();

// Helper
function generateJobId(): string {
    return Math.random().toString(36).substring(2, 11);
}


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
        const { query, session, name } = req.body;

        if (!query || typeof query !== 'string') {
            return res.status(400).json({ error: 'Query parameter is required and must be a string' });
        }

        console.log(`[Server] Received query: "${query}" (Session: ${session || 'new'}, Name: ${name || 'none'})`);
        const result = await client.query(query, { session, name });

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

        // Create Job
        const jobId = generateJobId();
        const job: Job = {
            id: jobId,
            type: 'audio-generation',
            status: 'pending',
            createdAt: Date.now()
        };
        jobs.set(jobId, job);

        // Start background processing
        console.log(`[Server] Starting async job ${jobId}: Audio Generation (DryRun: ${dryRun})`);

        // Ensure client initialized? It is if !notebookClient passed.

        (async () => {
            try {
                jobs.set(jobId, { ...job, status: 'processing' });
                await notebookClient!.generateAudioOverview(notebookTitle, sources, customPrompt, true, dryRun);
                // Note: generateAudioOverview waits for completion now (due to true arg)
                jobs.set(jobId, { ...job, status: 'completed', result: { message: 'Audio generated' } });
                console.log(`[Server] Job ${jobId} completed.`);
            } catch (err: any) {
                console.error(`[Server] Job ${jobId} failed:`, err);
                jobs.set(jobId, { ...job, status: 'failed', error: err.message });
            }
        })();

        res.status(202).json({
            success: true,
            message: 'Audio generation started',
            jobId,
            statusUrl: `/jobs/${jobId}`
        });

    } catch (e: any) {
        console.error('[Server] Generate audio request failed:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

app.get('/jobs/:id', (req, res) => {
    const jobId = req.params.id;
    const job = jobs.get(jobId);

    if (!job) {
        return res.status(404).json({ success: false, error: 'Job not found' });
    }

    res.json({ success: true, job });
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
