/**
 * Windmill Script: Sync Gemini Research to FalkorDB
 * 
 * This script can be run manually or on a schedule via Windmill.
 * It calls the rsrch server to sync Gemini conversations and research docs to FalkorDB.
 * 
 * Usage:
 *   - Manual: Run from Windmill UI
 *   - Scheduled: Set up a trigger (e.g., every hour)
 *   - CLI: wmill script run f/rsrch/sync_gemini_to_falkor
 */

export async function main(args: {
    rsrchUrl?: string;
    limit?: number;
    syncResearchDocs?: boolean;
    syncConversations?: boolean;
}): Promise<{
    success: boolean;
    researchDocs?: { synced: number };
    conversations?: { synced: number };
    error?: string;
}> {
    const RSRCH_URL = args.rsrchUrl || process.env.RSRCH_URL || "http://localhost:3030";
    const limit = args.limit || 100;
    const syncResearchDocs = args.syncResearchDocs ?? true;
    const syncConversations = args.syncConversations ?? true;

    const result: {
        success: boolean;
        researchDocs?: { synced: number };
        conversations?: { synced: number };
        error?: string;
    } = { success: true };

    try {
        // 1. Sync research documents
        if (syncResearchDocs) {
            console.log(`[SyncGemini] Syncing research documents (limit: ${limit})...`);
            const researchRes = await fetch(`${RSRCH_URL}/gemini/sync-graph`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ limit })
            });

            if (!researchRes.ok) {
                const errText = await researchRes.text();
                throw new Error(`Failed to sync research docs: ${errText}`);
            }

            const researchData = await researchRes.json();
            result.researchDocs = { synced: researchData.synced || 0 };
            console.log(`[SyncGemini] Synced ${result.researchDocs.synced} research documents`);
        }

        // 2. Sync Gemini conversations (if available)
        if (syncConversations) {
            console.log(`[SyncGemini] Syncing Gemini conversations...`);
            const convRes = await fetch(`${RSRCH_URL}/gemini/list-conversations?limit=${limit}`);

            if (convRes.ok) {
                const convData = await convRes.json();
                if (convData.success && convData.data) {
                    // The sync happens automatically when listing, just report count
                    result.conversations = { synced: convData.data.length || 0 };
                    console.log(`[SyncGemini] Found ${result.conversations.synced} conversations`);
                }
            } else {
                console.log('[SyncGemini] Conversations endpoint not available, skipping');
            }
        }

        return result;

    } catch (error: any) {
        console.error(`[SyncGemini] Error: ${error.message}`);
        return {
            success: false,
            error: error.message
        };
    }
}
