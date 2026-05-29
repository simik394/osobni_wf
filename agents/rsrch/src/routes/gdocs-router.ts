import { Router } from 'express';
import { UniversalContext, GDocsActionDeps } from '../actions/types';
import { 
    createGDocAction, 
    listGDocTabsAction, 
    addGDocTabAction, 
    addSubtabGDocAction, 
    duplicateGDocTabAction,
    writeToGDocAction,
    switchGDocTabAction
} from '../actions/gdocs';
import { selectors } from '../selectors';
import { config } from '../config';

export function createGDocsRouter(deps: any) {
    const router = Router();
    const { browserClient } = deps;

    async function runGDocsAction(
        action: (ctx: UniversalContext, deps: GDocsActionDeps) => Promise<any>,
        docUrl?: string
    ) {
        if (!browserClient.isBrowserInitialized()) {
            await browserClient.init();
        }

        const page = await browserClient.getTabPage('gdocs');
        if (docUrl && page.url() !== docUrl) {
            await page.goto(docUrl);
        }

        const ctx: UniversalContext = {
            page,
            log: (msg: string, level?: 'info' | 'warn' | 'error') => {
                const prefix = level === 'error' ? '[GDocs][ERROR]' : level === 'warn' ? '[GDocs][WARN]' : '[GDocs]';
                console.log(`${prefix} ${msg}`);
            },
            config,
        };

        const actionDeps: GDocsActionDeps = {
            selectors,
            config,
            humanDelay: async (ms: number, variance?: number) => {
                const delay = ms + (variance ? Math.random() * variance : 0);
                await page.waitForTimeout(delay);
            }
        };

        return await action(ctx, actionDeps);
    }

    router.post('/create', async (req, res) => {
        try {
            const { title } = req.body;
            const url = await runGDocsAction(async (ctx, deps) => {
                return await createGDocAction(ctx, title);
            });
            res.json({ success: true, data: { url } });
        } catch (e: any) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    router.post('/tabs/list', async (req, res) => {
        try {
            const { docUrl } = req.body;
            const tabs = await runGDocsAction(async (ctx, deps) => {
                return await listGDocTabsAction(ctx, deps);
            }, docUrl);
            res.json({ success: true, data: tabs });
        } catch (e: any) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    router.post('/tabs/add', async (req, res) => {
        try {
            const { docUrl, tabName } = req.body;
            const success = await runGDocsAction(async (ctx, deps) => {
                return await addGDocTabAction(ctx, deps, tabName);
            }, docUrl);
            res.json({ success: true, data: { success } });
        } catch (e: any) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    router.post('/tabs/add-subtab', async (req, res) => {
        try {
            const { docUrl, parentTabName, subtabName } = req.body;
            const success = await runGDocsAction(async (ctx, deps) => {
                return await addSubtabGDocAction(ctx, deps, parentTabName, subtabName);
            }, docUrl);
            res.json({ success: true, data: { success } });
        } catch (e: any) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    router.post('/write', async (req, res) => {
        try {
            const { docUrl, content, tabName, append } = req.body;
            const success = await runGDocsAction(async (ctx, deps) => {
                if (tabName) {
                    await switchGDocTabAction(ctx, deps, tabName);
                }
                return await writeToGDocAction(ctx, content, { append });
            }, docUrl);
            res.json({ success: true, data: { success } });
        } catch (e: any) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    return router;
}
