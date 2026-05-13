import { Router } from 'express';
import { BrowserClient } from '../clients/base';

export function createPerplexityRouter(deps: any) {
    const router = Router();
    const { browserClient } = deps;

    router.post('/query', async (req, res) => {
        try {
            const { query, sessionId, name, deep, keepAlive } = req.body;
            if (!query) return res.status(400).json({ success: false, error: 'Query is required' });

            if (!browserClient.isBrowserInitialized()) {
                await browserClient.init();
            }

            const client = await browserClient.createPerplexityClient();
            const result = await client.query(query, { sessionId, name, deep });
            res.json({ success: true, ...result });
        } catch (e: any) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    router.post('/batch', async (req, res) => {
        try {
            const { queries } = req.body;
            if (!queries || !Array.isArray(queries)) {
                return res.status(400).json({ success: false, error: 'Queries array is required' });
            }

            if (!browserClient.isBrowserInitialized()) {
                await browserClient.init();
            }

            const client = await browserClient.createPerplexityClient();
            const results = [];
            for (const q of queries) {
                const result = await client.query(q);
                results.push(result);
            }
            res.json({ success: true, results });
        } catch (e: any) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    return router;
}
