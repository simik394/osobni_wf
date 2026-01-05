/**
 * Windmill Script: Sync NotebookLM to FalkorDB
 * 
 * This script syncs NotebookLM notebooks, sources, and audio overviews to FalkorDB.
 * Can be run manually or on a schedule via Windmill.
 * 
 * Usage:
 *   - Manual: Run from Windmill UI
 *   - Scheduled: Set up a trigger (e.g., every hour)
 *   - CLI: wmill script run f/rsrch/sync_notebooklm_to_falkor
 */

export async function main(args: {
    rsrchUrl?: string;
    limit?: number;
}): Promise<{
    success: boolean;
    notebooks?: { synced: number; sources: number; artifacts: number };
    error?: string;
}> {
    const RSRCH_URL = args.rsrchUrl || process.env.RSRCH_URL || "http://localhost:3030";
    const limit = args.limit || 50;

    try {
        console.log(`[SyncNotebookLM] Fetching notebooks (limit: ${limit})...`);

        // 1. List notebooks from NotebookLM
        const listRes = await fetch(`${RSRCH_URL}/notebook/list`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ limit })
        });

        if (!listRes.ok) {
            const errText = await listRes.text();
            throw new Error(`Failed to list notebooks: ${errText}`);
        }

        const listData = await listRes.json();
        if (!listData.success) {
            throw new Error(listData.error || 'Unknown error listing notebooks');
        }

        const notebooks = listData.data || [];
        console.log(`[SyncNotebookLM] Found ${notebooks.length} notebooks`);

        let totalSources = 0;
        let totalArtifacts = 0;

        // 2. Sync each notebook to FalkorDB
        for (const notebook of notebooks) {
            try {
                console.log(`[SyncNotebookLM] Syncing notebook: ${notebook.title || notebook.id}`);

                // The sync-graph endpoint handles upserting to FalkorDB
                const syncRes = await fetch(`${RSRCH_URL}/notebook/sync-graph`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ notebookId: notebook.id })
                });

                if (syncRes.ok) {
                    const syncData = await syncRes.json();
                    if (syncData.sources) totalSources += syncData.sources;
                    if (syncData.artifacts) totalArtifacts += syncData.artifacts;
                }
            } catch (e: any) {
                console.warn(`[SyncNotebookLM] Error syncing notebook ${notebook.id}: ${e.message}`);
            }
        }

        console.log(`[SyncNotebookLM] Complete: ${notebooks.length} notebooks, ${totalSources} sources, ${totalArtifacts} artifacts`);

        return {
            success: true,
            notebooks: {
                synced: notebooks.length,
                sources: totalSources,
                artifacts: totalArtifacts
            }
        };

    } catch (error: any) {
        console.error(`[SyncNotebookLM] Error: ${error.message}`);
        return {
            success: false,
            error: error.message
        };
    }
}
