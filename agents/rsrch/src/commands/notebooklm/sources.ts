import { Command } from 'commander';
import { sendServerRequest } from '../../cli/utils';
import { resolveLocalFiles, resolveTextContent } from '../../cli/notebook-utils';
import * as fs from 'node:fs';
import * as path from 'node:path';

export function registerSourceCommands(notebook: Command) {
    notebook.command('add-web-source <url>')
        .description('Add a website source URL to a notebook')
        .option('--notebook <title>', 'Notebook title')
        .action(async (url, opts) => {
            console.log(`[CLI] Adding web source ${url}...`);
            await sendServerRequest('/notebook/add-source', { notebookTitle: opts.notebook, url });
        });

    notebook.command('add-local-source <paths...>')
        .alias('add-file')
        .description('Upload local files or directories (e.g. PDF, TXT) to a notebook')
        .option('--notebook <title>', 'Notebook title')
        .action(async (filePaths, opts) => {
            const filesToUpload = resolveLocalFiles(filePaths);
            if (filesToUpload.length === 0) {
                console.error('Error: No valid files found to upload.');
                process.exit(1);
            }
            
            console.log(`[CLI] Reading ${filesToUpload.length} local files as base64...`);
            const payloadFiles = filesToUpload.map(f => ({
                content: fs.readFileSync(f, 'base64'),
                filename: path.basename(f)
            }));

            console.log(`[CLI] Uploading to server...`);
            // We use the same /gemini/upload endpoint for simplicity if it exists, 
            // or we could have a notebook-specific one. 
            // Actually, notebook/add-source should handle base64 files.
            await sendServerRequest('/notebook/add-source', { 
                notebookTitle: opts.notebook, 
                files: payloadFiles 
            });
        });

    notebook.command('add-drive-source <docNames>')
        .description('Add Google Drive sources (comma-separated)')
        .option('--notebook <title>', 'Notebook title')
        .action(async (docNamesStr, opts) => {
            const docNames = docNamesStr.split(',').map((s: string) => s.trim()).filter((s: string) => s.length > 0);
            if (docNames.length === 0) {
                console.error('No valid document names provided.');
                process.exit(1);
            }
            console.log(`[CLI] Adding drive sources: ${docNames.join(', ')}`);
            await sendServerRequest('/notebook/add-drive-source', { notebookTitle: opts.notebook, docNames });
        });

    notebook.command('add-text <notebookTitle> <content>')
        .description('Add text or file content to notebook')
        .option('--source-title <title>', 'Custom source title')
        .action(async (notebookTitle, content, opts) => {
            const textContent = await resolveTextContent(content);
            console.log(`[CLI] Adding text source to notebook "${notebookTitle}"...`);
            await sendServerRequest('/notebook/add-text', {
                notebookTitle,
                text: textContent,
                sourceTitle: opts.sourceTitle
            });
        });

    notebook.command('sources <title>')
        .description('List notebook sources')
        .action(async (title) => {
            const data = await sendServerRequest('/notebook/content-preview', { notebookTitle: title, type: 'sources' });
            if (data?.success) {
                console.log(JSON.stringify(data.data, null, 2));
            }
        });

    notebook.command('rename-source <notebookTitle> <oldTitle> <newTitle>')
        .description('Rename a source in a notebook')
        .action(async (notebookTitle, oldTitle, newTitle) => {
            console.log(`[CLI] Renaming source "${oldTitle}" to "${newTitle}"...`);
            const data = await sendServerRequest('/notebook/rename-source', { notebookTitle, oldTitle, newTitle });
            if (data?.success) console.log('✅ Successfully renamed source.');
        });

    notebook.command('select-sources <notebookTitle> <sourcesOrRange>')
        .description('Select sources for grounding. Provide comma-separated names or an index range like 1,3-5,!4')
        .action(async (notebookTitle, sourcesOrRange) => {
            console.log(`[CLI] Selecting sources "${sourcesOrRange}"...`);
            const data = await sendServerRequest('/notebook/select-sources', { notebookTitle, sourcesOrRange });
            if (data?.success) console.log('✅ Successfully selected sources.');
        });

    notebook.command('delete-source <notebookTitle> <sourceTitle>')
        .description('Delete a source from a notebook by title')
        .action(async (notebookTitle, sourceTitle) => {
            console.log(`[CLI] Deleting source "${sourceTitle}"...`);
            const data = await sendServerRequest('/notebook/delete-source', { notebookTitle, sourceTitle });
            if (data?.success) console.log('✅ Successfully deleted source.');
        });
}
