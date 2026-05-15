import { Command } from 'commander';
import { sendServerRequest } from '../../cli/utils';
import { config } from '../../config';
import { getGraphStore } from '../../core/graph-store';

export function registerNotebookCommands(notebook: Command) {
    notebook.command('create <title>')
        .description('Create a new notebook')
        .action(async (title) => {
            console.log(`[CLI] Creating notebook: ${title}...`);
            const data = await sendServerRequest('/notebook/create', { title });
            if (data?.success) console.log(`✅ Successfully created notebook "${title}".`);
        });

    notebook.command('rename <old> <new>')
        .description('Rename a notebook')
        .action(async (old, newTitle) => {
            console.log(`[CLI] Renaming notebook "${old}" to "${newTitle}"...`);
            const data = await sendServerRequest('/notebook/rename', { oldTitle: old, newTitle });
            if (data?.success) console.log(`✅ Successfully renamed notebook.`);
        });

    notebook.command('delete <title>')
        .description('Delete a notebook')
        .action(async (title) => {
            console.log(`[CLI] Deleting notebook: ${title}...`);
            const data = await sendServerRequest('/notebook/delete', { title });
            if (data?.success) console.log(`✅ Successfully deleted notebook.`);
        });

    notebook.command('list')
        .description('List notebooks with pagination')
        .option('--offset <n>', 'Offset for pagination', '0')
        .option('--limit <n>', 'Limit for pagination', '20')
        .action(async (opts) => {
            const offset = parseInt(opts.offset, 10);
            const limit = parseInt(opts.limit, 10);
            const data = await sendServerRequest('/notebook/list', { offset, limit });
            if (data?.success) {
                console.log(JSON.stringify(data.data, null, 2));
            } else {
                console.log(JSON.stringify(data, null, 2));
            }
        });

    notebook.command('sync')
        .description('Sync notebook(s) to graph')
        .option('--title <title>', 'Notebook title (sync single)')
        .option('--pattern <regex>', 'Regex pattern to filter notebooks')
        .option('-a, --audio', 'Download audio during sync')
        .action(async (opts) => {
            const store = getGraphStore();
            await store.connect(config.falkor.host, config.falkor.port);

            try {
                if (opts.title) {
                    console.log(`\n[Sync] Scraping notebook via server: "${opts.title}"...`);
                    const res = await sendServerRequest('/notebook/scrape', { notebookTitle: opts.title, downloadAudio: opts.audio });
                    if (res?.success && res.data) {
                        const result = await store.syncNotebook(res.data);
                        console.log(`\n[Sync] Result: ${result.isNew ? 'New' : 'Updated'} notebook ${result.id}\n`);
                    }
                } else {
                    console.log('\n[Sync] Listing all notebooks from server...');
                    const listRes = await sendServerRequest('/notebook/list', { limit: 1000 });
                    let notebooks = listRes?.data || [];

                    if (opts.pattern) {
                        const regex = new RegExp(opts.pattern, 'i');
                        notebooks = notebooks.filter((n: { title: string }) => regex.test(n.title));
                        console.log(`[Sync] Filtered by pattern "${opts.pattern}": ${notebooks.length} notebooks found.`);
                    }

                    console.log(`\n[Sync] Processing ${notebooks.length} notebooks...`);

                    for (const nbItem of notebooks) {
                        if (opts.pattern) {
                            console.log(`  - Scraping content for "${nbItem.title}" via server...`);
                            const scrapeRes = await sendServerRequest('/notebook/scrape', { notebookTitle: nbItem.title, downloadAudio: opts.audio });
                            if (scrapeRes?.success && scrapeRes.data) {
                                await store.syncNotebook(scrapeRes.data);
                                console.log(`    ✓ Synced content.`);
                            }
                        } else {
                            const result = await store.syncNotebook({
                                platformId: nbItem.platformId,
                                title: nbItem.title
                            });
                            console.log(`  - ${nbItem.title} (${result.id}) [Metadata Only]`);
                        }
                    }
                }
            } catch (e: any) {
                console.error(`[Sync] Error: ${e.message}`);
            } finally {
                await store.disconnect();
            }
        });

    notebook.command('stats <title>')
        .description('Get notebook stats')
        .action(async (title) => {
            const res = await sendServerRequest('/notebook/stats', { title });
            if (res?.success) {
                console.log(JSON.stringify(res.data, null, 2));
            } else {
                console.log(JSON.stringify(res, null, 2));
            }
        });
}
