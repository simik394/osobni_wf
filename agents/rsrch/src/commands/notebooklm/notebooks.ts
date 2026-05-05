import { Command } from 'commander';
import { runLocalNotebookAction, sendServerRequest } from '../../cli/utils';
import { config } from '../../config';
import { getGraphStore } from '../../core/graph-store';
import { cliContext } from '../../cli/context';

export function registerNotebookCommands(notebook: Command) {
    notebook.command('create <title>')
        .description('Create a new notebook')
        .option('--local', 'Use local execution', false)
        .action(async (title, opts) => {
            await runLocalNotebookAction(async (client, notebook) => {
                console.log(`[CLI] Creating notebook: ${title}...`);
                await notebook.createNotebook(title);
                console.log(`✅ Successfully created notebook "${title}".`);
            });
        });

    notebook.command('list')
        .description('List notebooks')
        .option('--local', 'Use local execution', false)
        .action(async (opts) => {
            if (opts.local || cliContext.get().local) {
                await runLocalNotebookAction(async (client, nb) => {
                    const notebooks = await nb.listNotebooks();
                    console.log(JSON.stringify(notebooks, null, 2));
                });
            } else {
                await sendServerRequest('/notebook/list');
            }
        });

    notebook.command('sync')
        .description('Sync notebook(s) to graph')
        .option('--title <title>', 'Notebook title (sync single)')
        .option('--pattern <regex>', 'Regex pattern to filter notebooks')
        .option('-a, --audio', 'Download audio during sync')
        .option('--local', 'Use local execution', false)
        .action(async (opts) => {
            const store = getGraphStore();
            await store.connect(config.falkor.host, config.falkor.port);

            try {
                await runLocalNotebookAction(async (client, nb) => {
                    if (opts.title) {
                        console.log(`\n[Sync] Scraping notebook: "${opts.title}"...`);
                        const data = await nb.scrapeNotebook(opts.title, opts.audio);
                        const result = await store.syncNotebook(data);
                        console.log(`\n[Sync] Result: ${result.isNew ? 'New' : 'Updated'} notebook ${result.id}\n`);
                    } else {
                        console.log('\n[Sync] Listing all notebooks...');
                        let notebooks = await nb.listNotebooks();

                        if (opts.pattern) {
                            const regex = new RegExp(opts.pattern, 'i');
                            notebooks = notebooks.filter((n: { title: string }) => regex.test(n.title));
                            console.log(`[Sync] Filtered by pattern "${opts.pattern}": ${notebooks.length} notebooks found.`);
                        }

                        console.log(`\n[Sync] Processing ${notebooks.length} notebooks...`);

                        for (const nbItem of notebooks) {
                            if (opts.pattern) {
                                console.log(`  - Scraping content for "${nbItem.title}"...`);
                                const data = await nb.scrapeNotebook(nbItem.title, opts.audio);
                                await store.syncNotebook(data);
                                console.log(`    ✓ Synced content.`);
                            } else {
                                const result = await store.syncNotebook({
                                    platformId: nbItem.platformId,
                                    title: nbItem.title
                                });
                                console.log(`  - ${nbItem.title} (${result.id}) [Metadata Only]`);
                            }
                        }
                    }
                });
            } finally {
                await store.disconnect();
            }
        });

    notebook.command('stats <title>')
        .description('Get notebook stats')
        .option('--local', 'Use local execution', false)
        .action(async (title, opts) => {
            if (opts.local || cliContext.get().local) {
                await runLocalNotebookAction(async (client, nb) => {
                    const stats = await nb.getNotebookStats(title);
                    console.log(JSON.stringify(stats, null, 2));
                });
            } else {
                await sendServerRequest('/notebook/stats', { title });
            }
        });
}
