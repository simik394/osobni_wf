import { GeminiClient } from './gemini-client';
import { GraphStore } from './graph-store';

/**
 * Sync Gemini research documents to FalkorDB.
 *
 * Extracts research docs from the Gemini session and creates corresponding
 * nodes in the FalkorDB graph.
 *
 * @param geminiClient Initialized GeminiClient instance
 * @param graphStore Initialized GraphStore instance
 * @param limit Max number of docs to sync (default: 50)
 */
export async function syncGeminiToGraph(
    geminiClient: GeminiClient,
    graphStore: GraphStore,
    limit: number = 50
): Promise<{ synced: number; total: number; syncedIds: string[] }> {
    console.log(`[Shared] Syncing Gemini research docs to FalkorDB (limit: ${limit})...`);

    // List research docs from Gemini
    const docs = await geminiClient.listDeepResearchDocuments(limit);
    console.log(`[Shared] Found ${docs.length} research documents`);

    let synced = 0;
    const syncedIds: string[] = [];

    for (const doc of docs) {
        try {
            const docId = doc.sessionId || '';
            if (!docId) {
                console.log(`[Sync] Skipping doc without sessionId: ${doc.title}`);
                continue;
            }

            // Create session in FalkorDB (duplicates will fail silently or be updated)
            // We prefix ID with 'gemini-' to ensure uniqueness across platforms
            const sessionId = `gemini-${docId}`;

            // The GraphStore.createSession method handles the details
            await graphStore.createSession({
                id: sessionId,
                platform: 'gemini',
                externalId: docId,
                query: doc.title || doc.firstHeading || ''
            });

            syncedIds.push(docId);
            synced++;
            console.log(`[Sync] Synced: ${doc.title || docId}`);
        } catch (e: any) {
            // Duplicate constraint errors are expected/handled
            if (e.message?.includes('duplicate') || e.message?.includes('already exists')) {
                console.log(`[Sync] Already synced: ${doc.sessionId}`);
            } else {
                console.warn(`[Sync] Failed to sync ${doc.sessionId}: ${e.message}`);
            }
        }
    }

    return {
        synced,
        total: docs.length,
        syncedIds
    };
}
