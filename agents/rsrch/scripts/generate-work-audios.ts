import axios from 'axios';
import { getGraphStore } from '../src/graph-store';

async function generateAudios() {
    const store = getGraphStore();
    const serverUrl = 'http://localhost:3001';

    try {
        await store.connect('localhost', 6379);
        console.log('[Batch] Connected to FalkorDB');

        // Query for documents without audio
        const result = await (store as any).graph.query('MATCH (d:ResearchDoc) WHERE NOT (d)-[:HAS_AUDIO]->(:Audio) RETURN d.id, d.title');
        const docs = result.data || [];

        if (docs.length === 0) {
            console.log('[Batch] No documents found that need audio generation.');
            return;
        }

        console.log(`[Batch] Found ${docs.length} documents to process.`);

        // Deduplicate by title to avoid redundant generation for highly similar docs
        // (Many docs in the user's graph have identical titles)
        const uniqueDocs = new Map<string, string>();
        for (const doc of docs) {
            const title = doc['d.title'];
            const id = doc['d.id'];
            if (!uniqueDocs.has(title)) {
                uniqueDocs.set(title, id);
            }
        }

        console.log(`[Batch] Unique titles to process: ${uniqueDocs.size}`);

        for (const [title, id] of uniqueDocs.entries()) {
            console.log(`\n[Batch] Processing: "${title}" (ID: ${id})`);
            try {
                const response = await axios.post(`${serverUrl}/notebooklm/create-audio-from-doc`, {
                    researchDocId: id,
                    dryRun: false
                });

                if (response.data.success) {
                    console.log(`[Batch] ✅ Success: ${title}`);
                    if (response.data.cached) {
                        console.log(`[Batch] (Audio already existed)`);
                    } else {
                        console.log(`[Batch] Path: ${response.data.localPath}`);
                    }
                } else {
                    console.error(`[Batch] ❌ Failed: ${title} - ${response.data.error}`);
                }
            } catch (err: any) {
                console.error(`[Batch] ❌ Error calling server for "${title}":`, err.response?.data?.error || err.message);
            }

            // Wait a bit between requests to be gentle on NotebookLM and the server
            await new Promise(resolve => setTimeout(resolve, 5000));
        }

    } catch (error: any) {
        console.error('[Batch] Fatal error:', error.message);
    } finally {
        await store.disconnect();
        console.log('[Batch] Disconnected from FalkorDB');
    }
}

generateAudios();
