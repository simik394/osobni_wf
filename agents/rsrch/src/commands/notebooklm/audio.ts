import { Command } from 'commander';
import { sendServerRequest } from '../../cli/utils';
import { resolveNotebookTitles } from '../../cli/notebook-utils';
import { config } from '../../config';
import { getGraphStore } from '../../core/graph-store';
import * as path from 'path';

export function registerAudioCommands(notebook: Command) {
    notebook.command('generate-audio')
        .alias('audio')
        .description('Generate audio for sources')
        .option('--notebook <title>', 'Notebook title')
        .option('--source <source>', 'Source name (can be used multiple times)', (val: string, memo: string[]) => { memo.push(val); return memo; }, [])
        .option('--sources <sources>', 'Comma-separated sources (legacy)')
        .option('--prompt <prompt>', 'Custom prompt')
        .option('--wet', 'Wet run (consume quota)', false)
        .option('--force', 'Force regenerate', false)
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
        .option('--latest', 'Latest audio only', false)
        .option('--pattern <regex>', 'Audio title pattern')
        .action(async (outputPath, opts) => {
            const finalOutputPath = outputPath || 'audio_overview.mp3';
            const resolvedOutputPath = path.resolve(process.cwd(), finalOutputPath);
            console.log(`[CLI] Downloading audio... Output: ${resolvedOutputPath}`);
            if (opts.latest) console.log(`[CLI] Mode: Latest audio only.`);
            if (opts.pattern) console.log(`[CLI] Mode: Filtering by pattern "${opts.pattern}".`);

            await sendServerRequest('/notebook/download-artifact', {
                notebookTitle: opts.notebook,
                artifactTitle: opts.pattern || 'Audio Overview',
                outputPath: resolvedOutputPath,
                isPattern: !!opts.pattern,
                latestOnly: opts.latest
            });
        });

    notebook.command('download-all-audio [outputDir]')
        .description('Download all audio overviews')
        .requiredOption('--notebook <title>', 'Notebook title')
        .option('--limit <number>', 'Limit number of downloads', parseInt)
        .action(async (outputDir, opts) => {
            const finalOutputDir = outputDir || './audio_downloads';
            const resolvedOutputDir = path.resolve(process.cwd(), finalOutputDir);
            console.log(`[CLI] Downloading ${opts.limit ? 'top ' + opts.limit : 'ALL'} audio from "${opts.notebook}"...`);

            const data = await sendServerRequest('/notebook/content-preview', { notebookTitle: opts.notebook, type: 'studio' });
            if (data?.success && data.data) {
                let audios = data.data.filter((a: any) => a.type === 'audio');
                if (opts.limit) audios = audios.slice(0, opts.limit);
                
                for (const audio of audios) {
                    console.log(`[CLI] Downloading: ${audio.title}`);
                    await sendServerRequest('/notebook/download-artifact', {
                        notebookTitle: opts.notebook,
                        artifactTitle: audio.title,
                        outputPath: resolvedOutputDir
                    });
                }
                console.log('✅ Done.');
            }
        });

    notebook.command('download-batch-audio')
        .description('Batch download audio from multiple notebooks')
        .requiredOption('--titles <titles>', 'Comma-separated titles or "all"')
        .requiredOption('--output <dir>', 'Output directory')
        .action(async (opts) => {
            const notebooksToProcess = await resolveNotebookTitles(opts.titles, async () => {
                const res = await sendServerRequest('/notebook/list', {});
                return res?.data ? res.data.map((n:any) => n.title) : [];
            });

            for (const title of notebooksToProcess) {
                console.log(`[Batch] Processing "${title}"...`);
                try {
                    const data = await sendServerRequest('/notebook/content-preview', { notebookTitle: title, type: 'studio' });
                    if (data?.success && data.data) {
                        const audios = data.data.filter((a: any) => a.type === 'audio');
                        if (audios.length > 0) {
                            const audio = audios[0];
                            const filename = `${title.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 50)}_${Date.now()}.mp3`;
                            const resolvedOutputPath = path.resolve(process.cwd(), path.join(opts.output, filename));
                            await sendServerRequest('/notebook/download-artifact', {
                                notebookTitle: title,
                                artifactTitle: audio.title,
                                outputPath: resolvedOutputPath
                            });
                            console.log(`[Batch] ✅ Downloaded audio for "${title}"`);
                        } else {
                            console.log(`[Batch] ⚠️ No audio found for "${title}"`);
                        }
                    }
                } catch (e: any) {
                    console.error(`[Batch] ❌ Error processing "${title}": `, e.message);
                }
            }
        });

    notebook.command('audio-status')
        .description('Check audio status (including generation progress)')
        .requiredOption('--notebook <title>', 'Notebook title')
        .action(async (opts) => {
            try {
                const result = await sendServerRequest('/notebook/audio-status', { notebookTitle: opts.notebook });
                const status = result?.data || result;
                console.log('\n--- NotebookLM Audio Status (via Server) ---');
                console.log(`Notebook: ${opts.notebook}`);
                console.log(`Status:   ${status?.status?.toUpperCase() || 'UNKNOWN'}`);
                if (status?.progress) console.log(`Progress: ${status.progress}`);
                console.log('-------------------------------------------\n');
            } catch (e: any) {
                console.error(`[CLI] Error: ${e.message}`);
            }
        });

    notebook.command('sources-without-audio')
        .description('List sources without generated audio')
        .requiredOption('--notebook <title>', 'Notebook title')
        .action(async (opts) => {
            const store = getGraphStore();
            try {
                await store.connect(config.falkor.host, config.falkor.port);

                const notebooks = await store.getNotebooks(100);
                const nb = notebooks.find(n => n.title.includes(opts.notebook) || opts.notebook.includes(n.title));

                if (!nb) {
                    console.error(`❌ Notebook "${opts.notebook}" not found in FalkorDB`);
                    process.exit(1);
                }

                const platformId = nb.id.replace('nb_', '');
                console.log(`📓 Notebook: ${nb.title} (${platformId})`);

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
}
