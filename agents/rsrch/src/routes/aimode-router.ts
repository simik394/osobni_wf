import { Router } from 'express';
import { UniversalContext, AIModeActionDeps } from '../actions/types';
import {
    listAIModeHistoryAction,
    listAIModeMyActivityAction,
    extractAIModeConversationAction,
    syncAIModeHistoryAction,
} from '../actions/aimode/history';
import {
    setAIModeModelAction,
    uploadAIModeFileAction,
    saveActiveAIModeChatAction,
    exportAIModeToGDocAction,
    exportAIModeToKeepAction
} from '../actions/aimode/chat';
import { selectors } from '../selectors';
import { config } from '../config';

export function createAIModeRouter(deps: any) {
    const router = Router();
    const { browserClient, graphStore } = deps;

    /**
     * Internal helper to run AI Mode actions on the server
     */
    async function runAIModeAction(
        action: (ctx: UniversalContext, deps: AIModeActionDeps) => Promise<any>,
        options: { connectGraphStore?: boolean } = {}
    ) {
        if (!browserClient.isBrowserInitialized()) {
            await browserClient.init();
        }

        const page = await browserClient.getTabPage('aimode');

        const ctx: UniversalContext = {
            page,
            log: (msg: string, level?: 'info' | 'warn' | 'error') => {
                const prefix = level === 'error' ? '[AI Mode][ERROR]' : level === 'warn' ? '[AI Mode][WARN]' : '[AI Mode]';
                console.log(`${prefix} ${msg}`);
            },
            config,
        };

        const actionDeps: AIModeActionDeps = {
            selectors,
            config,
            humanDelay: async (ms: number, variance?: number) => {
                const delay = ms + (variance ? Math.random() * variance : 0);
                await page.waitForTimeout(delay);
            },
            dumpState: async (prefix: string) => {
                const fs = await import('fs');
                const path = await import('path');
                const dataDir = path.join(config.paths.resultsDir, 'debug');
                if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
                const timestamp = Date.now();
                const htmlPath = path.join(dataDir, `${prefix}_${timestamp}.html`);
                const pngPath = path.join(dataDir, `${prefix}_${timestamp}.png`);
                await fs.promises.writeFile(htmlPath, await page.content());
                await page.screenshot({ path: pngPath, fullPage: true });
                return { htmlPath, pngPath };
            },
            getGraphStore: () => graphStore,
        };

        if (options.connectGraphStore) {
            await graphStore.connect(config.falkor.host, config.falkor.port);
        }

        try {
            return await action(ctx, actionDeps);
        } finally {
            if (options.connectGraphStore) {
                await graphStore.disconnect().catch(() => {});
            }
            // We don't close the client here, just leave the tab open or let the pool handle it
            // browserClient.getTabPage might handle pooling already.
        }
    }

    router.post('/list', async (req, res) => {
        try {
            const limit = req.body.limit !== undefined ? req.body.limit : req.body.size;
            const offset = req.body.offset || 0;
            const entries = await runAIModeAction(async (ctx, deps) => {
                return await listAIModeHistoryAction(ctx, deps, { offset, limit });
            });
            res.json({ success: true, data: entries });
        } catch (e: any) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    router.post('/list-activity', async (req, res) => {
        try {
            const limit = req.body.limit !== undefined ? req.body.limit : req.body.size;
            const offset = req.body.offset || 0;
            const entries = await runAIModeAction(async (ctx, deps) => {
                return await listAIModeMyActivityAction(ctx, deps, { offset, limit });
            });
            res.json({ success: true, data: entries });
        } catch (e: any) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    router.post('/sync', async (req, res) => {
        try {
            const limit = req.body.limit || 10;
            const extractContent = req.body.extractContent !== false;
            const result = await runAIModeAction(async (ctx, deps) => {
                return await syncAIModeHistoryAction(ctx, deps, { limit, extractContent });
            }, { connectGraphStore: true });
            res.json({ success: true, data: result });
        } catch (e: any) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    router.post('/extract', async (req, res) => {
        try {
            const { url } = req.body;
            if (!url) return res.status(400).json({ success: false, error: 'URL is required' });
            
            const conversation = await runAIModeAction(async (ctx, deps) => {
                const entry = { query: 'manual extraction', url, id: null, timestamp: undefined };
                return await extractAIModeConversationAction(ctx, deps, entry);
            });
            res.json({ success: true, data: conversation });
        } catch (e: any) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    router.post('/model', async (req, res) => {
        try {
            const { model } = req.body;
            if (!model || !['auto', 'pro'].includes(model)) {
                return res.status(400).json({ success: false, error: 'Model must be either "auto" or "pro"' });
            }
            const success = await runAIModeAction(async (ctx, deps) => {
                return await setAIModeModelAction(ctx, deps, model);
            });
            res.json({ success, data: { model } });
        } catch (e: any) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    router.post('/upload', async (req, res) => {
        try {
            const { filePath, model } = req.body;
            if (!filePath) {
                return res.status(400).json({ success: false, error: 'filePath is required' });
            }
            const success = await runAIModeAction(async (ctx, deps) => {
                return await uploadAIModeFileAction(ctx, deps, filePath, { model });
            });
            res.json({ success, data: { filePath, model } });
        } catch (e: any) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    router.post('/save-active', async (req, res) => {
        try {
            const { outputFile } = req.body;
            const result = await runAIModeAction(async (ctx, deps) => {
                return await saveActiveAIModeChatAction(ctx, deps, { outputFile });
            });
            res.json({ success: true, data: result });
        } catch (e: any) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    router.post('/export/gdocs', async (req, res) => {
        try {
            const { title, docUrl, tabName, append } = req.body;
            const url = await runAIModeAction(async (ctx, deps) => {
                return await exportAIModeToGDocAction(ctx, deps, { title, docUrl, tabName, append });
            });
            res.json({ success: true, data: { url } });
        } catch (e: any) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    router.post('/export/keep', async (req, res) => {
        try {
            const { title, labels } = req.body;
            const success = await runAIModeAction(async (ctx, deps) => {
                return await exportAIModeToKeepAction(ctx, deps, { title, labels });
            });
            res.json({ success: true, data: { success } });
        } catch (e: any) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    return router;
}
