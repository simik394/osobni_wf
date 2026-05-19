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
            const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
            const offset = req.query.offset ? parseInt(req.query.offset as string) : undefined;
            const query = req.query.q as string;
            
            const client = await getKeepClient();
            const notes = await client.listNotes({ limit, offset, query });
            res.json({ success: true, data: notes });
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    });

    router.get('/notes/detail', async (req: Request, res: Response) => {
        try {
            const title = req.query.title as string;
            const index = req.query.index ? parseInt(req.query.index as string) : undefined;

            const client = await getKeepClient();
            const note = await client.getNote({ title, index });
            if (!note) {
                return res.status(404).json({ error: 'Note not found' });
            }
            res.json({ success: true, data: note });
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

    router.patch('/notes', async (req: Request, res: Response) => {
        try {
            const { title, index, newTitle, newContent, replace } = req.body;
            const client = await getKeepClient();
            const success = await client.updateNote(
                { title, index: index !== undefined ? parseInt(index) : undefined },
                { newTitle, newContent, replace: replace === true || replace === 'true' }
            );
            res.json({ success });
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    });

    router.post('/notes/labels', async (req: Request, res: Response) => {
        try {
            const { title, index, labelName, action } = req.body;
            if (!labelName) return res.status(400).json({ error: 'Label name is required' });
            if (action !== 'add' && action !== 'remove') {
                return res.status(400).json({ error: 'Action must be "add" or "remove"' });
            }

            const client = await getKeepClient();
            const success = await client.manageLabels(
                { title, index: index !== undefined ? parseInt(index) : undefined },
                labelName,
                action
            );
            res.json({ success });
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    });

    router.post('/notes/grab-text', async (req: Request, res: Response) => {
        try {
            const { title, index } = req.body;
            const client = await getKeepClient();
            const success = await client.grabImageText({ title, index: index !== undefined ? parseInt(index) : undefined });
            res.json({ success });
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    });

    router.post('/notes/collaborator', async (req: Request, res: Response) => {
        try {
            const { title, index, email } = req.body;
            if (!email) return res.status(400).json({ error: 'Email is required' });

            const client = await getKeepClient();
            const success = await client.addCollaborator(
                { title, index: index !== undefined ? parseInt(index) : undefined },
                email
            );
            res.json({ success });
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    });

    router.post('/notes/reminder', async (req: Request, res: Response) => {
        try {
            const { title, index, reminderText } = req.body;
            if (!reminderText) return res.status(400).json({ error: 'Reminder text is required' });

            const client = await getKeepClient();
            const success = await client.setReminder(
                { title, index: index !== undefined ? parseInt(index) : undefined },
                reminderText
            );
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
