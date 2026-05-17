import { Command } from 'commander';
import { sendServerRequest } from '../../cli/utils';
import * as path from 'path';

export function registerArtifactCommands(notebook: Command) {
    notebook.command('artifacts <title>')
        .description('Get notebook artifacts')
        .action(async (title) => {
            const data = await sendServerRequest('/notebook/content-preview', { notebookTitle: title, type: 'studio' });
            if (data?.success) {
                console.log(JSON.stringify(data.data, null, 2));
            }
        });

    notebook.command('download-artifact <notebookTitle> <artifactTitle> [outputPathOrDir]')
        .description('Download a specific artifact (audio, text, note, etc.)')
        .option('--latest', 'Latest matching artifact only', false)
        .option('--pattern', 'Treat the title as a regex pattern', false)
        .action(async (notebookTitle, artifactTitle, outputPathOrDir, opts) => {
            const finalOutputPath = outputPathOrDir || './downloads';
            const resolvedOutputPath = path.resolve(process.cwd(), finalOutputPath);
            console.log(`[CLI] Requesting artifact download: "${artifactTitle}"... Output: ${resolvedOutputPath}`);
            await sendServerRequest('/notebook/download-artifact', {
                notebookTitle,
                artifactTitle,
                outputPath: resolvedOutputPath,
                isPattern: opts.pattern,
                latestOnly: opts.latest
            });
        });

    notebook.command('download-all-artifacts [outputDir]')
        .description('Download all non-audio text artifacts (Briefing Doc, FAQ, Study Guide, etc.) from a notebook')
        .requiredOption('--notebook <title>', 'Notebook title')
        .action(async (outputDir, opts) => {
            const finalOutputDir = outputDir || './downloads';
            const resolvedOutputDir = path.resolve(process.cwd(), finalOutputDir);
            console.log(`[CLI] Requesting all artifacts from "${opts.notebook}" to: ${resolvedOutputDir}`);
            await sendServerRequest('/notebook/content-download', {
                notebookTitle: opts.notebook,
                type: 'studio',
                outputDir: resolvedOutputDir
            });
        });

    notebook.command('archive <title>')
        .description('Full archival of a notebook (sources, all artifacts, and latest audio)')
        .option('-o, --output <dir>', 'Output directory', 'data/artifacts/notebooklm')
        .option('-f, --format <format>', 'Output format (md, qmd)', 'md')
        .option('-s, --sources', 'Extract full text content of all sources', false)
        .option('-i, --incremental', 'Skip already archived items', false)
        .action(async (title, opts) => {
            console.log(`[CLI] Requesting full archival for: "${title}"`);
            const data = await sendServerRequest('/notebook/archive', {
                notebookTitle: title,
                outputDir: opts.output,
                format: opts.format,
                extractSources: !!opts.sources,
                incremental: !!opts.incremental
            });
            if (data?.success && data.data) {
                console.log(`\n--- Archival Summary ---`);
                if (data.data.length === 0) {
                    console.log('No files archived.');
                } else {
                    console.log(`Successfully archived ${data.data.length} items.`);
                    data.data.forEach((f: string) => console.log(`- ${path.relative(process.cwd(), f)}`));
                }
                console.log('------------------------\n');
            }
        });
    notebook.command('presentation <notebook>')
        .description('Generate a slide deck (presentation) for a notebook')
        .option('--sources <sources>', 'Comma-separated sources (indices or titles)')
        .action(async (notebook, opts) => {
            console.log(`[CLI] Requesting presentation generation for notebook: "${notebook}"...`);
            const sources = opts.sources ? opts.sources.split(',').map((s: string) => s.trim()) : undefined;
            const data = await sendServerRequest('/notebook/presentation', { notebookTitle: notebook, sources });
            if (data?.success) {
                console.log('✅ Presentation generation triggered.');
            } else {
                console.error('❌ Failed to trigger presentation generation');
            }
        });

    notebook.command('infographic <notebook>')
        .description('Generate an infographic for a notebook')
        .option('--sources <sources>', 'Comma-separated sources (indices or titles)')
        .action(async (notebook, opts) => {
            console.log(`[CLI] Requesting infographic generation for notebook: "${notebook}"...`);
            const sources = opts.sources ? opts.sources.split(',').map((s: string) => s.trim()) : undefined;
            const data = await sendServerRequest('/notebook/infographic', { notebookTitle: notebook, sources });
            if (data?.success) {
                console.log('✅ Infographic generation triggered.');
            } else {
                console.error('❌ Failed to trigger infographic generation');
            }
        });
}
