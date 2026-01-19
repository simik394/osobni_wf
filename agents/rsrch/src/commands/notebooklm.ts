import { Command } from 'commander';
import { runLocalNotebookAction, sendServerRequest } from '../cli-utils';
import * as path from 'path';
import * as fs from 'fs';
import { config } from '../config';
import { getGraphStore } from '../graph-store';

const notebook = new Command('notebook').description('NotebookLM commands');

notebook.command('create <title>')
    .description('Create a notebook')
    .option('--local', 'Use local execution', true)
    .action(async (title, opts) => {
        if (true) { // Forced local
            await runLocalNotebookAction(async (client, notebook) => {
                await notebook.createNotebook(title);
            });
        } else {
            await sendServerRequest('/notebook/create', { title });
        }
    });

notebook.command('add-source <url>')
    .description('Add a source URL to a notebook')
    .option('--notebook <title>', 'Notebook title')
    .option('--local', 'Use local execution', true)
    .action(async (url, opts) => {
        await runLocalNotebookAction(async (client, notebook) => {
            if (opts.notebook) {
                await notebook.openNotebook(opts.notebook);
            }
            await notebook.addSourceUrl(url);
        });
    });

notebook.command('add-drive-source <docNames>')
    .description('Add Google Drive sources (comma-separated)')
    .option('--notebook <title>', 'Notebook title')
    .option('--local', 'Use local execution', true)
    .action(async (docNamesStr, opts) => {
        const docNames = docNamesStr.split(',').map((s: string) => s.trim()).filter((s: string) => s.length > 0);
        if (docNames.length === 0) {
            console.error('No valid document names provided.');
            process.exit(1);
        }

        await runLocalNotebookAction(async (client, notebook) => {
            await notebook.addSourceFromDrive(docNames, opts.notebook);
        });
    });

notebook.command('generate-audio')
    .alias('audio')
    .description('Generate audio for sources')
    .option('--notebook <title>', 'Notebook title')
    .option('--source <source>', 'Source name (can be used multiple times)', (val: string, memo: string[]) => { memo.push(val); return memo; }, [])
    .option('--sources <sources>', 'Comma-separated sources (legacy)')
    .option('--prompt <prompt>', 'Custom prompt')
    .option('--wet', 'Wet run (consume quota)', false)
    .option('--force', 'Force regenerate', false)
    .option('--local', 'Use local execution (Deprecated)', false)
    .action(async (opts) => {
        let sources = opts.source || [];
        if (opts.sources) {
            sources = sources.concat(opts.sources.split(',').map((s: string) => s.trim()).filter((s: string) => s.length > 0));
        }

        const dryRun = !opts.wet;

        if (dryRun) {
            console.log('\n🧪 DRY RUN MODE ACTIVE');
            console.log('   Audio generation will be simulated correctly, but the final "Generate" click will be SKIPPED.');
            console.log('   To actually generate audio (and consume quota), use the --wet flag.\n');
        } else {
            console.log('\n🌊 WET RUN ACTIVE');
            console.log('   Audio WILL be generated. Quota will be consumed.\n');
        }

        if (sources.length > 0) {
            console.log(`📝 Selected sources (${sources.length}):`);
            sources.forEach((s: string, i: number) => console.log(`   ${i + 1}. ${s}`));
        }
        if (opts.prompt) {
            console.log(`💬 Custom prompt: "${opts.prompt}"`);
        }
        if (opts.force) {
            console.log('⚡ Force mode: will regenerate even if audio already exists');
        }

        if (opts.local) {
            console.warn('\n⚠️  WARNING: --local flag is DEPRECATED for audio generation.');
            console.warn('   Routing through server -> Windmill to prevent race conditions.');
            console.warn('   Remove --local flag - it will be ignored.\n');
        }

        console.log('📤 Queueing via Windmill (prevents race conditions)...\n');
        await sendServerRequest('/notebook/generate-audio', {
            notebookTitle: opts.notebook,
            sources,
            customPrompt: opts.prompt,
            dryRun
        });
        console.log('\n✅ Audio generation queued. Check ntfy or Windmill UI for status.');
    });

notebook.command('download-audio [outputPath]')
    .description('Download audio overview')
    .requiredOption('--notebook <title>', 'Notebook title')
    .option('--local', 'Use local execution', true)
    .option('--latest', 'Latest audio only', false)
    .option('--pattern <regex>', 'Audio title pattern')
    .action(async (outputPath, opts) => {
        const finalOutputPath = outputPath || 'audio_overview.mp3';

        await runLocalNotebookAction(async (client, notebook) => {
            const resolvedOutputPath = path.resolve(process.cwd(), finalOutputPath);
            console.log(`[CLI] Downloading audio... Output: ${resolvedOutputPath}`);
            if (opts.latest) console.log(`[CLI] Mode: Latest audio only.`);
            if (opts.pattern) console.log(`[CLI] Mode: Filtering by pattern "${opts.pattern}".`);

            await notebook.downloadAudio(opts.notebook, resolvedOutputPath, {
                latestOnly: opts.latest,
                audioTitlePattern: opts.pattern
            });
        });
    });

notebook.command('download-all-audio [outputDir]')
    .description('Download all audio overviews')
    .requiredOption('--notebook <title>', 'Notebook title')
    .option('--local', 'Use local execution', true)
    .option('--limit <number>', 'Limit number of downloads', parseInt)
    .action(async (outputDir, opts) => {
        const finalOutputDir = outputDir || './audio_downloads';

        await runLocalNotebookAction(async (client, notebook) => {
            const resolvedOutputDir = path.resolve(process.cwd(), finalOutputDir);
            console.log(`[CLI] Downloading ${opts.limit ? 'top ' + opts.limit : 'ALL'} audio... Output: ${resolvedOutputDir}`);

            await notebook.downloadAllAudio(opts.notebook, resolvedOutputDir, { limit: opts.limit });
        });
    });

notebook.command('sync')
    .description('Sync notebook(s) to graph')
    .option('--title <title>', 'Notebook title (sync single)')
    .option('--pattern <regex>', 'Regex pattern to filter notebooks')
    .option('-a, --audio', 'Download audio during sync')
    .option('--local', 'Use local execution', true)
    .action(async (opts) => {
        const store = getGraphStore();
        const graphHost = config.falkor.host;
        await store.connect(graphHost, config.falkor.port);

        try {
            await runLocalNotebookAction(async (client, notebook) => {
                if (opts.title) {
                    console.log(`\n[Sync] Scraping notebook: "${opts.title}"...`);
                    if (opts.audio) console.log('[Sync] Audio download enabled (-a)');

                    const data = await notebook.scrapeNotebook(opts.title, opts.audio);
                    const result = await store.syncNotebook(data);
                    console.log(`\n[Sync] Result: ${result.isNew ? 'New' : 'Updated'} notebook ${result.id}\n`);
                } else {
                    console.log('\n[Sync] Listing all notebooks...');
                    let notebooks = await notebook.listNotebooks();

                    if (opts.pattern) {
                        try {
                            const regex = new RegExp(opts.pattern, 'i');
                            notebooks = notebooks.filter((nb: { title: string }) => regex.test(nb.title));
                            console.log(`[Sync] Filtered by pattern "${opts.pattern}": ${notebooks.length} notebooks found.`);
                        } catch (e: any) {
                            console.error(`[Sync] Invalid regex pattern: ${e.message}`);
                            process.exit(1);
                        }
                    }

                    console.log(`\n[Sync] Processing ${notebooks.length} notebooks. Syncing metadata...`);

                    for (const nb of notebooks) {
                        if (opts.pattern) {
                            console.log(`  - Scraping content for "${nb.title}"...`);
                            const data = await notebook.scrapeNotebook(nb.title, opts.audio);
                            await store.syncNotebook(data);
                            console.log(`    ✓ Synced content.`);
                        } else {
                            const result = await store.syncNotebook({
                                platformId: nb.platformId,
                                title: nb.title
                            });
                            console.log(`  - ${nb.title} (${result.id}) [Metadata Only]`);
                        }
                    }
                    if (!opts.pattern) {
                        console.log('\n[Sync] Metadata sync complete. To scrape contents, use: rsrch notebook sync --title "Name" (or --pattern)\n');
                    }
                }
            });
        } finally {
            await store.disconnect();
        }
    });

notebook.command('list')
    .description('List notebooks')
    .option('--local', 'Use local execution', true)
    .action(async (opts) => {
        if (opts.local) {
            await runLocalNotebookAction(async (client, notebook) => {
                const notebooks = await notebook.listNotebooks();
                console.log(JSON.stringify(notebooks, null, 2));
            });
        } else {
            await sendServerRequest('/notebook/list');
        }
    });

notebook.command('stats <title>')
    .description('Get notebook stats')
    .option('--local', 'Use local execution', true)
    .action(async (title, opts) => {
        if (opts.local) {
            await runLocalNotebookAction(async (client, notebook) => {
                const stats = await notebook.getNotebookStats(title);
                console.log(JSON.stringify(stats, null, 2));
            });
        } else {
            await sendServerRequest('/notebook/stats', { title });
        }
    });

notebook.command('sources <title>')
    .description('List notebook sources')
    .option('--local', 'Use local execution', true)
    .action(async (title, opts) => {
        if (opts.local) {
            await runLocalNotebookAction(async (client, notebook) => {
                await notebook.openNotebook(title);
                const sources = await notebook.getSources();
                console.log(JSON.stringify(sources, null, 2));
            });
        } else {
            await sendServerRequest('/notebook/sources', { title });
        }
    });

notebook.command('messages <title>')
    .description('Get notebook chat messages')
    .option('--local', 'Use local execution', true)
    .action(async (title, opts) => {
        if (opts.local) {
            await runLocalNotebookAction(async (client, notebook) => {
                await notebook.openNotebook(title);
                const messages = await notebook.getChatMessages();
                console.log(JSON.stringify(messages, null, 2));
            });
        } else {
            await sendServerRequest('/notebook/messages', { title });
        }
    });

notebook.command('add-text <notebookTitle> <content>')
    .description('Add text or file content to notebook')
    .option('--source-title <title>', 'Custom source title')
    .option('--local', 'Use local execution', true)
    .action(async (notebookTitle, content, opts) => {
        let textContent = content;

        if (textContent.startsWith('@')) {
            const filePath = textContent.slice(1);
            if (!fs.existsSync(filePath)) {
                console.error(`File not found: ${filePath}`);
                process.exit(1);
            }
            textContent = fs.readFileSync(filePath, 'utf-8');
            console.log(`[CLI] Loaded ${textContent.length} chars from ${filePath}`);
        } else if (textContent === '-') {
            const readline = await import('readline');
            const rl = readline.createInterface({ input: process.stdin });
            const lines: string[] = [];
            for await (const line of rl) {
                lines.push(line);
            }
            textContent = lines.join('\n');
            console.log(`[CLI] Read ${textContent.length} chars from stdin`);
        }

        if (opts.local) {
            await runLocalNotebookAction(async (client, notebook) => {
                await notebook.addSourceText(textContent, opts.sourceTitle, notebookTitle);
                console.log(`\n✓ Added text source to notebook "${notebookTitle}"`);
                if (opts.sourceTitle) {
                    console.log(`  Source title: ${opts.sourceTitle}`);
                }
                console.log(`  Content length: ${textContent.length} chars\n`);
            });
        } else {
            await sendServerRequest('/notebook/add-text', {
                notebookTitle,
                text: textContent,
                sourceTitle: opts.sourceTitle
            });
        }
    });

notebook.command('download-batch-audio')
    .description('Batch download audio from multiple notebooks')
    .requiredOption('--titles <titles>', 'Comma-separated titles or "all"')
    .requiredOption('--output <dir>', 'Output directory')
    .option('--local', 'Use local execution', true)
    .action(async (opts) => {
        await runLocalNotebookAction(async (client, notebook) => {
            let notebooksToProcess: string[] = [];
            const titlesArg = opts.titles;

            if (titlesArg === 'all' || titlesArg === '*') {
                console.log('[Batch] Fetching all notebooks...');
                const allNotebooks = await notebook.listNotebooks();
                notebooksToProcess = allNotebooks.map((n: { title: string }) => n.title);
                console.log(`[Batch] Found ${notebooksToProcess.length} notebooks.`);
            } else {
                notebooksToProcess = titlesArg.split(',').map((t: string) => t.trim());
            }

            for (const title of notebooksToProcess) {
                console.log(`[Batch] Processing "${title}"...`);
                try {
                    const result = await notebook.scrapeNotebook(title, true, {
                        outputDir: opts.output,
                        filename: `${title.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 50)}_${Date.now()}.mp3`
                    });

                    const audioCount = result.audioOverviews.length;
                    if (audioCount > 0) {
                        console.log(`[Batch] ✅ Downloaded audio for "${title}"`);
                    } else {
                        console.log(`[Batch] ⚠️ No audio found for "${title}"`);
                    }
                } catch (e: any) {
                    console.error(`[Batch] ❌ Error processing "${title}": `, e.message);
                }
            }
        });
    });

notebook.command('artifacts <title>')
    .description('Get notebook artifacts')
    .option('--local', 'Use local execution', true)
    .action(async (title, opts) => {
        if (opts.local) {
            await runLocalNotebookAction(async (client, notebook) => {
                await notebook.openNotebook(title);
                const artifacts = await notebook.getStudioArtifacts();
                console.log(JSON.stringify(artifacts, null, 2));
            });
        } else {
            await sendServerRequest('/notebook/artifacts', { title });
        }
    });

notebook.command('audio-status')
    .description('Check audio status')
    .requiredOption('--notebook <title>', 'Notebook title')
    .option('--local', 'Use local execution', true)
    .action(async (opts) => {
        if (opts.local) {
            await runLocalNotebookAction(async (client, notebook) => {
                const status = await notebook.checkAudioStatus(opts.notebook);
                console.log(JSON.stringify(status, null, 2));
            });
        } else {
            await sendServerRequest('/notebook/audio-status', { notebookTitle: opts.notebook });
        }
    });

notebook.command('sources-without-audio')
    .description('List sources without generated audio')
    .requiredOption('--notebook <title>', 'Notebook title')
    .action(async (opts) => {
        const store = getGraphStore();
        const graphHost = config.falkor.host;

        try {
            await store.connect(graphHost, config.falkor.port);

            const notebooks = await store.getNotebooks(100);
            const notebook = notebooks.find(n => n.title.includes(opts.notebook) || opts.notebook.includes(n.title));

            if (!notebook) {
                console.error(`❌ Notebook "${opts.notebook}" not found in FalkorDB`);
                console.error('   Make sure to sync the notebook first: rsrch notebook sync --title "..." --local');
                process.exit(1);
            }

            const platformId = notebook.id.replace('nb_', '');
            console.log(`📓 Notebook: ${notebook.title} (${platformId})`);

            const sources = await store.getSourcesWithoutAudio(platformId);

            if (sources.length === 0) {
                console.log('✅ All sources have audio generated!');
            } else {
                console.log(`\n📋 Sources without audio (${sources.length}):\n`);
                sources.forEach((s: any, i: number) => {
                    console.log(`   ${i + 1}. ${s.title} [${s.type}]`);
                });
            }
        } finally {
            await store.disconnect();
        }
    });

export const notebookCommand = notebook;
