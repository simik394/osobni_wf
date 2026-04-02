import { Router } from 'express';
import { dashboardService } from '../services/dashboard-service';
import { BrowserClient } from '../clients/base';

export function createSystemRouter(deps: { browserClient: BrowserClient }) {
    const router = Router();

    /**
     * GET /system/status
     * Returns synthesized dashboard metrics.
     */
    router.get('/status', async (req, res) => {
        try {
            const status = await dashboardService.getStatus();
            res.json({
                ...status,
                browser: deps.browserClient.isBrowserInitialized() ? 'Ready' : 'Not Initialized'
            });
        } catch (error) {
            console.error('[SystemRouter] Error fetching status:', error);
            res.status(500).json({ error: 'Failed to fetch status' });
        }
    });

    /**
     * POST /system/refresh
     * Triggers a system refresh (re-scanning codebase or re-initializing browser).
     */
    router.post('/refresh', async (req, res) => {
        try {
            console.log('[SystemRouter] Refreshing dashboard data...');
            // In the future, this could trigger a re-build of the site or specific cache clears.
            const status = await dashboardService.getStatus();
            res.json({ success: true, status });
        } catch (error) {
            console.error('[SystemRouter] Error during refresh:', error);
            res.status(500).json({ error: 'Refresh failed' });
        }
    });

    return router;
}
