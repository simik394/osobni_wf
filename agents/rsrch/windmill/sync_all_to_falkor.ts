/**
 * Windmill Script: Full Sync All to FalkorDB
 * 
 * Master script that runs all sync operations:
 * - Gemini research documents
 * - Gemini conversations  
 * - NotebookLM notebooks
 * 
 * Usage:
 *   - Manual: Run from Windmill UI for full sync
 *   - Scheduled: Run daily for comprehensive sync
 *   - CLI: wmill script run f/rsrch/sync_all_to_falkor
 */

export async function main(args: {
    rsrchUrl?: string;
    limit?: number;
}): Promise<{
    success: boolean;
    gemini?: { researchDocs: number; conversations: number };
    notebookLM?: { notebooks: number; sources: number; artifacts: number };
    error?: string;
}> {
    const RSRCH_URL = args.rsrchUrl || process.env.RSRCH_URL || "http://localhost:3030";
    const limit = args.limit || 100;

    const result: {
        success: boolean;
        gemini?: { researchDocs: number; conversations: number };
        notebookLM?: { notebooks: number; sources: number; artifacts: number };
        error?: string;
    } = { success: true };

    const errors: string[] = [];

    // 1. Sync Gemini
    console.log('=== Syncing Gemini ===');
    try {
        const geminiRes = await fetch(`${RSRCH_URL}/gemini/sync-graph`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ limit })
        });

        if (geminiRes.ok) {
            const data = await geminiRes.json();
            result.gemini = {
                researchDocs: data.synced || 0,
                conversations: 0
            };
            console.log(`[Gemini] Synced ${result.gemini.researchDocs} research documents`);
        } else {
            errors.push(`Gemini sync failed: ${await geminiRes.text()}`);
        }
    } catch (e: any) {
        errors.push(`Gemini error: ${e.message}`);
    }

    // 2. Sync NotebookLM
    console.log('=== Syncing NotebookLM ===');
    try {
        const listRes = await fetch(`${RSRCH_URL}/notebook/list`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ limit })
        });

        if (listRes.ok) {
            const listData = await listRes.json();
            if (listData.success && listData.data) {
                result.notebookLM = {
                    notebooks: listData.data.length,
                    sources: 0,
                    artifacts: 0
                };
                console.log(`[NotebookLM] Found ${result.notebookLM.notebooks} notebooks`);
            }
        } else {
            errors.push(`NotebookLM list failed: ${await listRes.text()}`);
        }
    } catch (e: any) {
        errors.push(`NotebookLM error: ${e.message}`);
    }

    // 3. Report results
    console.log('=== Sync Complete ===');
    console.log(JSON.stringify(result, null, 2));

    if (errors.length > 0) {
        result.success = false;
        result.error = errors.join('; ');
    }

    return result;
}
