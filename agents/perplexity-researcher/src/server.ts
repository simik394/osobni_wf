import express from 'express';
import { PerplexityClient } from './client';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// Initialize the client
const client = new PerplexityClient();

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
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
