import { Command } from 'commander';
import { 
    sendServerRequest 
} from '../../cli/utils';

export function registerSyncCommands(gemini: Command) {
    gemini.command('list-updates')
        .description('List sessions that need syncing')
        .option('--limit <number>', 'Limit items to scan', (v) => parseInt(v), 50)
        .action(async (opts) => {
            try {
                // list-sessions via server
                const result = await sendServerRequest('/gemini/sessions', { limit: opts.limit });
                const sessions = result?.data || [];
                console.log(`[CLI] Scanned ${sessions.length} sessions from backend.`);

                // We need a server-side endpoint for "what needs sync" to be truly stateless
                // For now, we can at least return the list and let the user decide
                console.log('\n--- Available Sessions ---');
                sessions.forEach((s: any) => {
                    console.log(` - ${s.id}: ${s.name}`);
                });
                console.log('--------------------------\n');
                console.log('Use "rsrch gemini scrape-session <id>" to sync specific sessions.');
            } catch(e: any) {
                console.error(`[CLI] Error: ${e.message}`);
            }
        });

    gemini.command('scrape-session <id>')
        .description('Scrape and sync a specific session')
        .action(async (id) => {
            console.log(`[CLI] Requesting server to scrape session: ${id}`);
            const openRes = await sendServerRequest('/session/open', { identifier: id });
            if (openRes?.success) {
                const dataRes = await sendServerRequest('/session/extract');
                if (dataRes?.success && dataRes.data) {
                    const data = dataRes.data;
                    // We need a server-side "sync-to-graph" for a single conversation
                    // For now, session/sync does it for many.
                    console.log(`[CLI] Successfully extracted: ${data.title}`);
                    console.log('Use "rsrch gemini sync-conversations" to ensure it is in the Graph Store.');
                }
            }
        });

    gemini.command('sync-conversations')
        .description('Fully sync conversations between Gemini and GraphStore')
        .option('--limit <number>', 'Max sessions to sync', (v) => parseInt(v), 10)
        .action(async (opts) => {
            console.log(`[CLI] Requesting server to perform full sync (limit: ${opts.limit})...`);
            const data = await sendServerRequest('/gemini/session/sync', { limit: opts.limit });
            if (data?.success) {
                console.log(`[Sync] Completed sync. Synced ${data.count} conversations.`);
            }
        });

    gemini.command('sync-registry')
        .description('Sync local artifact registry to Graph Store')
        .action(async () => {
            const data = await sendServerRequest('/gemini/sync-registry');
            if (data?.success && data.data) {
                console.log(`[CLI] Registry sync complete: ${data.data.synced}/${data.data.total} artifacts synced.`);
            }
        });
}
