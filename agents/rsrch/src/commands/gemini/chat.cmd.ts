import { Command } from 'commander';
import { 
    sendServerRequest, 
    sendServerRequestWithSSE, 
    getOptionsWithGlobals 
} from '../../cli/utils';
import { WindmillClient } from '../../clients/windmill';

export function registerChatCommands(gemini: Command) {
    gemini
        .command('chat <message>')
        .description('Chat with Gemini')
        .option('-s, --session <id>', 'Session ID')
        .option('--model <name>', 'Gemini Model (e.g. "Gemini 1.5 Pro", "Gemini 1.5 Flash")')
        .option('-f, --file <path...>', 'File(s) to attach')
        .action(async (message, opts, cmdObj) => {
            const options = getOptionsWithGlobals(cmdObj);
            const sessionId = options.session;
            const model = options.model;
            let files = options.file || [];

            if (files.length > 0) {
                console.log(`[CLI] Uploading ${files.length} attachments (base64)...`);
                const fs = await import('node:fs');
                const path = await import('node:path');

                const payloadFiles = [];
                for (const file of files) {
                    const absPath = path.resolve(file);
                    if (fs.existsSync(absPath)) {
                        payloadFiles.push({
                            content: fs.readFileSync(absPath, 'base64'),
                            filename: path.basename(absPath)
                        });
                    }
                }

                if (payloadFiles.length > 0) {
                    const upRes = await sendServerRequest('/gemini/upload', { files: payloadFiles });
                    if (upRes.success && upRes.paths) {
                        files = upRes.paths;
                    }
                }
            }
            await sendServerRequestWithSSE('/gemini/chat', { message, sessionId, stream: true, model, files });
        });

    gemini.command('research <query>')
        .description('Execute a Google Gemini research query (Deep Research)')
        .action(async (query) => {
            console.log(`[CLI] 🚀 Dispatching 'research' to Windmill...`);
            const client = new WindmillClient();
            try {
                const result = await client.executeJob('rsrch/execute', {
                    command: 'research',
                    args: { query }
                });
                console.log('\n--- Windmill Response ---\n');
                console.log(result);
                console.log('\n-----------------------\n');
            } catch (e: any) {
                console.error(`[CLI] Windmill execution failed: ${e.message}`);
                process.exit(1);
            }
        });

    gemini.command('deep-research <query>')
        .description('Run deep research')
        .option('--gem <name>', 'Gem name')
        .option('--remote', 'Use Windmill remote execution (Default)', true)
        .option('--async', 'Start async (returns job ID immediately)')
        .action(async (query, opts) => {
            if (opts.remote && !opts.async) {
                console.log(`[CLI] 🚀 Dispatching 'deep-research' to Windmill...`);
                const client = new WindmillClient();
                try {
                    const result = await client.executeJob('rsrch/execute', {
                        command: 'deep-research',
                        args: { query, gem: opts.gem }
                    });
                    console.log('\n--- Windmill Response ---\n');
                    console.log(result);
                    console.log('\n-----------------------\n');
                } catch (e: any) {
                    console.error(`[CLI] Windmill execution failed: ${e.message}`);
                    process.exit(1);
                }
                return;
            }

            console.log('[Deep Research] Starting async job via server...');
            const response = await sendServerRequest('/deep-research/start', {
                query,
                gem: opts.gem
            });
            console.log(`\n✓ Job created: ${response.jobId}`);
            console.log(`  Status: ${response.status}`);
            console.log(`\n  Check status: rsrch gemini job-status ${response.jobId}`);
            console.log(`  Get result:   rsrch gemini job-result ${response.jobId}\n`);
        });

    gemini
        .command('set-model <model>')
        .description('Set Gemini model')
        .action(async (model, opts, cmdObj) => {
            const result = await sendServerRequest('/gemini/set-model', { model });
            if (result.success) {
                console.log(result.message);
            }
        });

    gemini.command('feedback <good|bad> [comment]')
        .description('Submit feedback for the last response')
        .action(async (type, comment) => {
            const isGood = type === 'good';
            const result = await sendServerRequest('/gemini/feedback', { isGood, comment });
            if (result.success) console.log('Feedback submitted.');
        });

    gemini.command('edit <newText>')
        .description('Edit the last user prompt and re-submit')
        .action(async (newText) => {
            const result = await sendServerRequest('/gemini/edit', { newText });
            if (result.success) console.log('Prompt edited and re-submitted.');
        });
}
