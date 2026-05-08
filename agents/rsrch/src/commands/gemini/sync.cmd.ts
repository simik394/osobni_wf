import { Command } from 'commander';
import { 
    runLocalGeminiAction, 
    getOptionsWithGlobals 
} from '../../cli/utils';
import { config } from '../../config';
import { getGraphStore } from '../../core/graph-store';

export function registerSyncCommands(gemini: Command) {
    gemini.command('list-updates')
        .description('List sessions that need syncing')
        .option('--local', 'Use local execution', true)
        .option('--limit <number>', 'Limit items to scan', (v) => parseInt(v), 50)
        .action(async (opts, cmd) => {
            const store = getGraphStore();
            await store.connect(config.falkor.host, config.falkor.port);

            try {
                await runLocalGeminiAction(async (client, gemini) => {
                    const sessions = await gemini.listSessions({ limit: opts.limit });
                    console.log(`[CLI] Scanned ${sessions.length} sessions from sidebar.`);

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
                });
            } finally {
                await store.disconnect();
            }
        });

    gemini.command('scrape-session <id>')
        .description('Scrape and sync a specific session')
        .option('--local', 'Use local execution', true)
        .action(async (id) => {
            const store = getGraphStore();
            await store.connect(config.falkor.host, config.falkor.port);

            try {
                await runLocalGeminiAction(async (client, gemini) => {
                    console.log(`[CLI] Scraping session: ${id}`);
                    const data = await gemini.extractCurrentConversation();
                    
                    if (data) {
                        await store.syncConversation({
                            id: id,
                            platform: 'gemini',
                            title: (data as any).title,
                            turns: (data as any).turns
                        });
                        console.log(`[CLI] Successfully synced: ${(data as any).title}`);
                    }
                }, id);
            } finally {
                await store.disconnect();
            }
        });

    gemini.command('sync-conversations')
        .description('Fully sync conversations between Gemini and GraphStore')
        .option('--limit <number>', 'Max sessions to sync', (v) => parseInt(v), 10)
        .action(async (opts) => {
            console.log(`[CLI] Starting full sync (limit: ${opts.limit})...`);
            // This would typically involve list-updates followed by multiple scrape-session calls
            // For now, we'll keep the placeholder logic or call the actions
            await runLocalGeminiAction(async (client, gemini) => {
                await gemini.scrapeConversations(opts.limit, 0, (progress) => {
                    console.log(`[Sync Progress] ${progress.message}`);
                });
            });
        });

    gemini.command('sync-registry')
        .description('Sync local artifact registry to Graph Store')
        .option('--local', 'Use local execution', true)
        .action(async () => {
            const store = getGraphStore();
            await store.connect(config.falkor.host, config.falkor.port);

            try {
                await runLocalGeminiAction(async (client, gemini) => {
                    const res = await gemini.syncRegistryToGraph(store);
                    console.log(`[CLI] Registry sync complete: ${res.synced}/${res.total} artifacts synced.`);
                });
            } finally {
                await store.disconnect();
            }
        });
}
