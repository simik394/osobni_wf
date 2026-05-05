import { Command } from 'commander';
import { runLocalNotebookAction, sendServerRequest } from '../../cli/utils';
import { resolveLocalFiles, resolveTextContent } from '../../cli/notebook-utils';
import { getWindmillClient } from '../../clients/windmill';
import { cliContext } from '../../cli/context';

export function registerSourceCommands(notebook: Command) {
    notebook.command('add-web-source <url>')
        .description('Add a website source URL to a notebook')
        .option('--notebook <title>', 'Notebook title')
        .option('--local', 'Use local execution', false)
        .action(async (url, opts) => {
            await runLocalNotebookAction(async (client, nb) => {
                if (opts.notebook) await nb.openNotebook(opts.notebook);
                await nb.addSourceUrl(url);
            });
        });

    notebook.command('add-local-source <paths...>')
        .alias('add-file')
        .description('Upload local files or directories (e.g. PDF, TXT) to a notebook')
        .option('--notebook <title>', 'Notebook title')
        .option('--local', 'Use local execution', false)
        .action(async (filePaths, opts) => {
            const filesToUpload = resolveLocalFiles(filePaths);
            
            if (filesToUpload.length === 0) {
                console.error('Error: No valid files found to upload.');
                process.exit(1);
            }

            console.log(`Found ${filesToUpload.length} files to upload.`);

            await runLocalNotebookAction(async (client, nb) => {
                if (opts.notebook) await nb.openNotebook(opts.notebook);
                console.log(`Uploading ${filesToUpload.length} files in a single batch...`);
                await nb.uploadLocalFile(filesToUpload);
                console.log(`✅ Successfully uploaded ${filesToUpload.length} files to NotebookLM.`);
            });
        });

    notebook.command('add-drive-source <docNames>')
        .description('Add Google Drive sources (comma-separated)')
        .option('--notebook <title>', 'Notebook title')
        .option('--local', 'Use local execution', false)
        .action(async (docNamesStr, opts) => {
            const docNames = docNamesStr.split(',').map((s: string) => s.trim()).filter((s: string) => s.length > 0);
            if (docNames.length === 0) {
                console.error('No valid document names provided.');
                process.exit(1);
            }

            await runLocalNotebookAction(async (client, nb) => {
                await nb.addSourceFromDrive(docNames, opts.notebook);
            });
        });

    notebook.command('add-text <notebookTitle> <content>')
        .description('Add text or file content to notebook')
        .option('--source-title <title>', 'Custom source title')
        .option('--local', 'Use local execution', false)
        .action(async (notebookTitle, content, opts) => {
            const textContent = await resolveTextContent(content);

            if (opts.local || cliContext.get().local) {
                await runLocalNotebookAction(async (client, nb) => {
                    await nb.addSourceText(textContent, opts.sourceTitle, notebookTitle);
                    console.log(`\n✓ Added text source to notebook "${notebookTitle}"`);
                    if (opts.sourceTitle) console.log(`  Source title: ${opts.sourceTitle}`);
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

    notebook.command('sources <title>')
        .description('List notebook sources')
        .option('--local', 'Use local execution', false)
        .action(async (title, opts) => {
            if (opts.local || cliContext.get().local) {
                await runLocalNotebookAction(async (client, nb) => {
                    await nb.openNotebook(title);
                    const sources = await nb.getSources();
                    console.log(JSON.stringify(sources, null, 2));
                });
            } else {
                await sendServerRequest('/notebook/sources', { title });
            }
        });

    notebook.command('rename-source <notebookTitle> <oldTitle> <newTitle>')
        .description('Rename a source in a notebook')
        .option('--local', 'Use local execution', true)
        .action(async (notebookTitle, oldTitle, newTitle, opts) => {
            if (opts.local) {
                await runLocalNotebookAction(async (client, nb) => {
                    await nb.openNotebook(notebookTitle);
                    await nb.renameSource(oldTitle, newTitle);
                    console.log(`✅ Successfully renamed source "${oldTitle}" to "${newTitle}" in notebook "${notebookTitle}".`);
                });
            } else {
                console.log('📤 Queueing via Windmill...');
                const windmill = getWindmillClient();
                const result = await windmill.triggerNotebookLMRenameSource(notebookTitle, oldTitle, newTitle);
                console.log(`\n✅ Windmill Job Queued: ${result.jobId || 'Failed'}`);
                if (result.error) console.error(result.error);
            }
        });

    notebook.command('select-sources <notebookTitle> <sourcesOrRange>')
        .description('Select sources for grounding. Provide comma-separated names or an index range like 1,3-5,!4')
        .option('--local', 'Use local execution', true)
        .action(async (notebookTitle, sourcesOrRange, opts) => {
            if (opts.local) {
                await runLocalNotebookAction(async (client, nb) => {
                    await nb.openNotebook(notebookTitle);
                    await nb.selectSources(sourcesOrRange);
                    console.log(`✅ Successfully selected sources for notebook "${notebookTitle}".`);
                });
            } else {
                console.log('📤 Queueing via Windmill...');
                const windmill = getWindmillClient();
                const result = await windmill.triggerNotebookLMSelectSources(notebookTitle, sourcesOrRange);
                console.log(`\n✅ Windmill Job Queued: ${result.jobId || 'Failed'}`);
                if (result.error) console.error(result.error);
            }
        });

    notebook.command('delete-source <notebookTitle> <sourceTitle>')
        .description('Delete a source from a notebook by title')
        .option('--local', 'Use local execution', false)
        .action(async (notebookTitle, sourceTitle, opts) => {
            if (opts.local || cliContext.get().local) {
                await runLocalNotebookAction(async (client, nb) => {
                    await nb.openNotebook(notebookTitle);
                    await nb.deleteSource(sourceTitle);
                    console.log(`✅ Successfully deleted source "${sourceTitle}" from notebook "${notebookTitle}".`);
                });
            } else {
                console.error('Error: Server-side source deletion not implemented. Use --local.');
                process.exit(1);
            }
        });
}
