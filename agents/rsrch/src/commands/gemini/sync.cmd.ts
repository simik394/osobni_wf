import { Command } from 'commander';
import { 
    getOptionsWithGlobals,
    sendServerRequest 
} from '../../cli/utils';
import { config } from '../../config';
import { getGraphStore } from '../../core/graph-store';

export function registerSyncCommands(gemini: Command) {
    gemini.command('list-updates')
        .description('List sessions that need syncing')
        .option('--limit <number>', 'Limit items to scan', (v) => parseInt(v), 50)
        .action(async (opts, cmd) => {
            const store = getGraphStore();
            await store.connect(config.falkor.host, config.falkor.port);
            try {
                const { serverUrl } = (await import('../../cli/context')).cliContext.get();
                const result = await (await import('../../cli/utils')).executeGeminiCommand('list-sessions', { limit: opts.limit }, { server: serverUrl });
                const sessions = result?.data || [];
                console.log(`[CLI] Scanned ${sessions.length} sessions from backend.`);

                const updatesNeeded: string[] = [];
                for (const session of sessions) {
                    if (session.pinned || !session.id) continue;

                    const state = await store.getConversationState(session.id, 'gemini');
                    if (!state.exists) {
                        console.log(`[CLI] New/Missing: ${session.id} (${session.name})`);
                        updatesNeeded.push(session.id);
                    } else {
                        console.log(`[CLI] Synced: ${session.id} (${session.name}) - Stopping scan.`);
                        break;
                    }
                }

                console.log('\n--- Updates Needed ---');
                console.log(JSON.stringify(updatesNeeded));
                console.log('----------------------\n');
            } catch(e: any) {
                console.error(`[CLI] Error: ${e.message}`);
            } finally {
                await store.disconnect();
            }
        });

    gemini.command('scrape-session <id>')
        .description('Scrape and sync a specific session')
        .action(async (id) => {
            const store = getGraphStore();
            await store.connect(config.falkor.host, config.falkor.port);

            try {
                console.log(`[CLI] Scraping session: ${id}`);
                const { sendServerRequest } = await import('../../cli/utils');
                const openRes = await sendServerRequest('/session/open', { identifier: id });
                if (openRes?.success) {
                    const dataRes = await sendServerRequest('/session/extract');
                    if (dataRes?.success && dataRes.data) {
                        const data = dataRes.data;
                        await store.syncConversation({
                            id: id,
                            platform: 'gemini',
                            title: data.title,
                            turns: data.turns
                        });
                        console.log(`[CLI] Successfully synced: ${data.title}`);
                    }
                }
            } finally {
                await store.disconnect();
            }
        });

    gemini.command('sync-conversations')
        .description('Fully sync conversations between Gemini and GraphStore')
        .option('--limit <number>', 'Max sessions to sync', (v) => parseInt(v), 10)
        .action(async (opts) => {
            console.log(`[CLI] Starting full sync (limit: ${opts.limit})...`);
            const { sendServerRequest } = await import('../../cli/utils');
            const data = await sendServerRequest('/session/scrape', { limit: opts.limit, offset: 0 });
            if (data?.success) {
                console.log(`[Sync] Completed sync. Synced ${data.count} conversations.`);
            }
        });

    gemini.command('sync-registry')
        .description('Sync local artifact registry to Graph Store')
        .action(async () => {
            const { sendServerRequest } = await import('../../cli/utils');
            const data = await sendServerRequest('/gemini/sync-registry');
            if (data?.success && data.data) {
                console.log(`[CLI] Registry sync complete: ${data.data.synced}/${data.data.total} artifacts synced.`);
            }
        });
}
