import { Router, Request, Response } from 'express';
import { BrowserClient } from '../clients/base';
import { KeepClient } from '../clients/keep';

export function createKeepRouter(deps: { 
    browserClient: BrowserClient 
}) {
    const router = Router();
    const { browserClient } = deps;
    let keepClient: KeepClient | null = null;

    async function getKeepClient(): Promise<KeepClient> {
        if (!keepClient) {
            if (!browserClient.isBrowserInitialized()) {
                await browserClient.init();
            }
            keepClient = await browserClient.createKeepClient();
        }
        return keepClient;
    }

    router.get('/notes', async (req: Request, res: Response) => {
        try {
            const client = await getKeepClient();
            const notes = await client.listNotes();
            res.json({ success: true, data: notes });
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    });

    router.post('/notes', async (req: Request, res: Response) => {
        try {
            const { title, content } = req.body;
            if (!content) return res.status(400).json({ error: 'Content is required' });
            
            const client = await getKeepClient();
            const success = await client.createNote(title || '', content);
            res.json({ success });
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    });

    return router;
}
