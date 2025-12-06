import express from 'express';
import { PerplexityClient } from './client';
import { config } from './config';

import { NotebookLMClient } from './notebooklm-client';

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

app.post('/notebook/generate-audio', async (req, res) => {
    try {
        const { notebookTitle, sources } = req.body;

        if (!notebookClient) {
            notebookClient = await client.createNotebookClient();
        }

        // Generate audio (client handles notebook opening if title provided)
        console.log(`[Server] Generating audio... (Notebook: ${notebookTitle}, Sources: ${sources})`);
        await notebookClient.generateAudioOverview(notebookTitle, sources);

        res.json({ success: true, message: `Audio generation started` });
    } catch (e: any) {
        console.error('[Server] Generate audio failed:', e);
        res.status(500).json({ success: false, error: e.message });
    }
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
