import { Command } from 'commander';
import { runLocalNotebookAction, sendServerRequest } from '../../cli/utils';
import { getWindmillClient } from '../../clients/windmill';
import { cliContext } from '../../cli/context';
import * as path from 'path';

export function registerArtifactCommands(notebook: Command) {
    notebook.command('artifacts <title>')
        .description('Get notebook artifacts')
        .option('--local', 'Use local execution', false)
        .action(async (title, opts) => {
            if (opts.local || cliContext.get().local) {
                await runLocalNotebookAction(async (client, nb) => {
                    await nb.openNotebook(title);
                    const artifacts = await nb.getStudioArtifacts();
                    console.log(JSON.stringify(artifacts, null, 2));
                });
            } else {
                await sendServerRequest('/notebook/artifacts', { title });
            }
        });

    notebook.command('download-artifact <notebookTitle> <artifactTitle> [outputPathOrDir]')
        .description('Download a specific artifact (audio, text, note, etc.)')
        .option('--local', 'Use local execution', true)
        .option('--latest', 'Latest matching artifact only', false)
        .option('--pattern', 'Treat the title as a regex pattern', false)
        .action(async (notebookTitle, artifactTitle, outputPathOrDir, opts) => {
            const finalOutputPath = outputPathOrDir || './downloads';

            if (opts.local) {
                await runLocalNotebookAction(async (client, nb) => {
                    const resolvedOutputPath = path.resolve(process.cwd(), finalOutputPath);
                    console.log(`[CLI] Downloading artifact "${artifactTitle}"... Output: ${resolvedOutputPath}`);

                    const success = await nb.downloadArtifact(notebookTitle, artifactTitle, resolvedOutputPath, {
                        isPattern: opts.pattern,
                        latestOnly: opts.latest
                    });

                    if (success) {
                        console.log('✅ Artifact successfully downloaded.');
                    } else {
                        console.log('❌ Failed to download artifact.');
                        process.exit(1);
                    }
                });
            } else {
                console.log('📤 Queueing via Windmill...');
                const windmill = getWindmillClient();
                const result = await windmill.triggerNotebookLMDownloadArtifact(notebookTitle, artifactTitle, finalOutputPath, {
                    isPattern: opts.pattern,
                    latestOnly: opts.latest
                });
                console.log(`\n✅ Windmill Job Queued: ${result.jobId || 'Failed'}`);
                if (result.error) console.error(result.error);
            }
        });

    notebook.command('download-all-artifacts [outputDir]')
        .description('Download all non-audio text artifacts (Briefing Doc, FAQ, Study Guide, etc.) from a notebook')
        .requiredOption('--notebook <title>', 'Notebook title')
        .option('--local', 'Use local execution', false)
        .action(async (outputDir, opts) => {
            const finalOutputDir = outputDir || './downloads';
            const notebookTitle = opts.notebook;

            if (opts.local || cliContext.get().local) {
                await runLocalNotebookAction(async (client, nb) => {
                    const resolvedOutputDir = path.resolve(process.cwd(), finalOutputDir);

                    console.log(`[CLI] Downloading all non-audio artifacts from "${notebookTitle}" to: ${resolvedOutputDir}`);
                    
                    await nb.openNotebook(notebookTitle);
                    const artifacts = await nb.getStudioArtifacts();
                    // Skip the first 9 fixed generator tiles (Audio, Presentation, etc.) as they are not artifacts themselves
                    const textArtifacts = artifacts.slice(9).filter((a: any) => a.type !== 'audio');

                    console.log(`[CLI] Found ${textArtifacts.length} text artifacts to download.`);

                    let successCount = 0;
                    for (const artifact of textArtifacts) {
                        console.log(`\n[CLI] Processing artifact: "${artifact.title}" (${artifact.type})`);
                        const success = await nb.downloadArtifact(notebookTitle, artifact.title, resolvedOutputDir);
                        if (success) successCount++;
                    }

                    console.log(`\n✅ Successfully downloaded ${successCount} artifacts.`);
                });
            } else {
                console.log('📤 Queueing all artifacts download via Windmill...');
                console.log('⚠️ Windmill fallback to local...');
                process.exit(1);
            }
        });
}
