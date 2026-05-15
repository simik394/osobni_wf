import { Command } from 'commander';
import { 
    sendServerRequest 
} from '../../cli/utils';

export function registerUploadCommands(gemini: Command) {
    async function uploadFilesToServer(filePaths: string[], sessionId?: string) {
        const fs = await import('node:fs');
        const path = await import('node:path');
        const payloadFiles = [];
        for (const file of filePaths) {
            const absPath = path.resolve(file);
            if (fs.existsSync(absPath)) {
                payloadFiles.push({
                    content: fs.readFileSync(absPath, 'base64'),
                    filename: path.basename(absPath),
                    encoding: 'base64'
                });
            } else {
                console.warn(`[CLI] File not found: ${absPath}`);
            }
        }

        if (payloadFiles.length > 0) {
            if (sessionId) {
                await sendServerRequest('/gemini/session/open', { identifier: sessionId }, 'POST');
            }
            return await sendServerRequest('/gemini/upload', { files: payloadFiles });
        }
        return { success: false, count: 0 };
    }

    gemini.command('upload <files...>')
        .description('Upload files to Gemini')
        .action(async (files) => {
            console.log(`Uploading ${files.length} files...`);
            const res = await uploadFilesToServer(files);
            if (res?.success) console.log(`Upload complete. (${res.count} files)`);
        });

    gemini.command('export-to-docs [sessionId]')
        .description('Export session to Google Docs')
        .action(async (sessionId) => {
            if (sessionId) await sendServerRequest('/gemini/session/open', { identifier: sessionId }, 'POST');

            console.log('\nExporting to Google Docs...');
            const data = await sendServerRequest('/gemini/export-to-docs');
            if (data?.success && data.data) {
                console.log('\n--- Export Result ---');
                if (data.data.docId) {
                    console.log(`Google Doc ID: ${data.data.docId}`);
                    console.log(`Google Doc URL: ${data.data.docUrl}`);
                } else {
                    console.log('Export failed - no document created');
                }
                console.log('---------------------\n');
            }
        });

    gemini.command('upload-file <path> [sessionId]')
        .description('Upload a file')
        .action(async (filePath, sessionId) => {
            const res = await uploadFilesToServer([filePath], sessionId);
            if (res?.success) console.log(`\n✅ File uploaded: ${filePath}`);
            else console.log(`\n❌ File upload failed: ${filePath}`);
        });

    gemini.command('upload-files <files...>')
        .description('Upload multiple files')
        .action(async (args) => {
            let sessionId: string | undefined;
            let filePaths = args;
            const fs = await import('node:fs');

            if (filePaths.length > 0 && !filePaths[0].includes('/') && !filePaths[0].includes('.') && !fs.existsSync(filePaths[0])) {
                sessionId = filePaths[0];
                filePaths = filePaths.slice(1);
            }

            const res = await uploadFilesToServer(filePaths, sessionId);
            if (res?.success) console.log(`\n✅ Uploaded ${res.count}/${filePaths.length} files`);
        });

    gemini.command('upload-repo <repoUrl> [sessionId]')
        .description('Upload repository context (cloned and processed on server)')
        .option('--branch <branch>', 'Git branch')
        .action(async (repoUrl, sessionId, opts) => {
            console.log(`\n[Repo] Requesting server to process repository: ${repoUrl}`);
            const res = await sendServerRequest('/gemini/upload-repo', { 
                repoUrl, 
                sessionId,
                branch: opts.branch 
            });
            if (res?.success) console.log(`\n✅ Repository context uploaded successfully!`);
            else console.log(`\n❌ Repository upload failed: ${res?.error || 'Unknown error'}`);
        });
    
    gemini.command('upload-drive <fileName> [sessionId]')
        .description('Upload a file from Google Drive')
        .action(async (fileName, sessionId) => {
            if (sessionId) await sendServerRequest('/gemini/session/open', { identifier: sessionId }, 'POST');
            
            const res = await sendServerRequest('/gemini/upload-drive', { fileName });
            if (res?.success) console.log(`\n✅ File attached from Drive: ${fileName}`);
            else console.log(`\n❌ Failed to attach file from Drive: ${fileName}`);
        });

    gemini.command('sources')
        .description('List available context sources')
        .action(async () => {
            const response = await sendServerRequest('/gemini/sources');
            if (response?.success && response.sources) {
                console.log('Available Context Sources:');
                response.sources.forEach((s: string) => console.log(` - ${s}`));
            }
        });
}
