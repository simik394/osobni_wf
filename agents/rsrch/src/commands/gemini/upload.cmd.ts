import { Command } from 'commander';
import { 
    runLocalGeminiAction, 
    sendServerRequest, 
    getOptionsWithGlobals 
} from '../../cli/utils';

export function registerUploadCommands(gemini: Command) {
    gemini
        .command('upload <files...>')
        .description('Upload files to Gemini')
        .action(async (files, opts, cmdObj) => {
            const options = getOptionsWithGlobals(cmdObj);
            console.log(`Uploading ${files.length} files...`);
            const useServer = !options.local;

            if (useServer) {
                const fs = await import('node:fs');
                const path = await import('node:path');

                const payloadFiles = [];
                for (const file of files) {
                    const absPath = path.resolve(file);
                    if (fs.existsSync(absPath)) {
                        payloadFiles.push({
                            content: fs.readFileSync(absPath, 'utf8'),
                            filename: path.basename(absPath)
                        });
                    }
                }

                if (payloadFiles.length > 0) {
                    await sendServerRequest('/gemini/upload', { files: payloadFiles });
                }
            } else {
                const path = await import('node:path');
                await runLocalGeminiAction(async (client, gemini) => {
                    await gemini.uploadFiles(files.map((f: string) => path.resolve(f)));
                });
            }
            console.log('Upload complete.');
        });

    gemini.command('export-to-docs [sessionId]')
        .description('Export session to Google Docs')
        .option('--local', 'Use local execution', true)
        .action(async (sessionId) => {
            await runLocalGeminiAction(async (client, gemini) => {
                console.log('\nExporting to Google Docs...');
                const result = await gemini.exportCurrentToGoogleDocs();
                console.log('\n--- Export Result ---');
                if (result.docId) {
                    console.log(`Google Doc ID: ${result.docId}`);
                    console.log(`Google Doc URL: ${result.docUrl}`);
                } else {
                    console.log('Export failed - no document created');
                }
                console.log('---------------------\n');
            }, sessionId);
        });

    gemini.command('upload-file <path> [sessionId]')
        .description('Upload a file')
        .option('--local', 'Use local execution', true)
        .action(async (filePath, sessionId) => {
            await runLocalGeminiAction(async (client, gemini) => {
                const success = await gemini.uploadFile(filePath);
                if (success) console.log(`\n✅ File uploaded: ${filePath}`);
                else console.log(`\n❌ File upload failed: ${filePath}`);
            }, sessionId);
        });

    gemini.command('upload-files <files...>')
        .description('Upload multiple files')
        .option('--local', 'Use local execution', true)
        .action(async (args) => {
            let sessionId: string | undefined;
            let filePaths = args;
            const fs = await import('node:fs');

            if (filePaths.length > 0 && !filePaths[0].includes('/') && !filePaths[0].includes('.') && !fs.existsSync(filePaths[0])) {
                sessionId = filePaths[0];
                filePaths = filePaths.slice(1);
            }

            await runLocalGeminiAction(async (client, gemini) => {
                const count = await gemini.uploadFiles(filePaths);
                console.log(`\n✅ Uploaded ${count}/${filePaths.length} files`);
            }, sessionId);
        });

    gemini.command('upload-repo <repoUrl> [sessionId]')
        .description('Upload repository context')
        .option('--branch <branch>', 'Git branch')
        .option('--local', 'Use local execution', true)
        .action(async (repoUrl, sessionId, opts) => {
            await runLocalGeminiAction(async (client, gemini) => {
                const { RepoLoader } = await import('../../core/repo-loader');
                const loader = new RepoLoader();
                try {
                    console.log(`\n[Repo] Processing repository: ${repoUrl}`);
                    const contextFile = await loader.loadRepoAsFile(repoUrl, { branch: opts.branch });
                    console.log(`\n[Repo] Context file created at: ${contextFile}`);
                    await gemini.uploadFile(contextFile);
                    console.log(`\n✅ Repository context uploaded successfully!`);
                } catch (e: any) {
                    console.error(`\n❌ Error processing repository: ${e.message}`);
                }
            }, sessionId);
        });
    
    gemini.command('upload-drive <fileName> [sessionId]')
        .description('Upload a file from Google Drive')
        .option('--local', 'Use local execution', true)
        .action(async (fileName, sessionId) => {
            await runLocalGeminiAction(async (client, gemini) => {
                const success = await gemini.uploadFromDrive(fileName);
                if (success) console.log(`\n✅ File attached from Drive: ${fileName}`);
                else console.log(`\n❌ Failed to attach file from Drive: ${fileName}`);
            }, sessionId);
        });

    gemini.command('sources')
        .description('List available context sources')
        .action(async () => {
            const response = await sendServerRequest('/gemini/sources');
            if (response.success && response.sources) {
                console.log('Available Context Sources:');
                response.sources.forEach((s: string) => console.log(` - ${s}`));
            }
        });
}
