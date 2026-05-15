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

    router.delete('/notes', async (req: Request, res: Response) => {
        try {
            const { title } = req.body;
            if (!title) return res.status(400).json({ error: 'Title is required' });
            
            const client = await getKeepClient();
            const success = await client.deleteNote(title);
            res.json({ success });
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    });

    router.post('/notes/archive', async (req: Request, res: Response) => {
        try {
            const { title } = req.body;
            if (!title) return res.status(400).json({ error: 'Title is required' });
            
            const client = await getKeepClient();
            const success = await client.archiveNote(title);
            res.json({ success });
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    });

    router.get('/search', async (req: Request, res: Response) => {
        try {
            const query = req.query.q as string;
            if (!query) return res.status(400).json({ error: 'Query is required' });
            
            const client = await getKeepClient();
            const notes = await client.searchNotes(query);
            res.json({ success: true, data: notes });
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    });

    return router;
}
