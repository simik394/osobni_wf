import { Command } from 'commander';
import { 
    runLocalGeminiAction, 
    sendServerRequest, 
    executeGeminiStream,
    getOptionsWithGlobals 
} from '../../cli/utils';
import { cliContext } from '../../cli/context';

export function registerJobCommands(gemini: Command) {
    gemini.command('job-status <jobId>')
        .description('Get status of an async deep research job')
        .action(async (jobId) => {
            const response = await sendServerRequest(`/deep-research/status/${jobId}`, {});
            console.log(`\n--- Job Status ---`);
            console.log(`ID:      ${response.jobId}`);
            console.log(`Status:  ${response.status}`);
            console.log(`Query:   ${response.query}`);
            if (response.error) console.log(`Error: ${response.error}`);
            console.log('------------------\n');
        });

    gemini.command('job-result <jobId>')
        .description('Get result of a completed async deep research job')
        .action(async (jobId) => {
            const response = await sendServerRequest(`/deep-research/result/${jobId}`, {});
            if (!response.success) {
                console.log(`\n⏳ Job not completed yet. Status: ${response.status}`);
                return;
            }
            console.log(`\n--- Job Result ---`);
            console.log(`ID: ${response.jobId}`);
            console.log(`Result:`, JSON.stringify(response.result, null, 2));
            console.log('------------------\n');
        });

    gemini.command('auth')
        .description('Launch interactive browser for manual authentication')
        .option('--local', 'Use local execution', true)
        .action(async () => {
            await runLocalGeminiAction(async (client, g) => {
                console.log('\n🔐 Interactive Authentication Mode');
                console.log('   Browser is open in VNC (display :99)');
                console.log('   Please sign in to Gemini manually.');
                console.log('\n   Press Enter here when finished to save and exit...\n');
                
                await g.goto('https://gemini.google.com/app');
                
                const readline = await import('node:readline');
                const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
                await new Promise(resolve => rl.question('>> Press [ENTER] to close browser and save session...', () => {
                    rl.close();
                    resolve(null);
                }));
            }, { skipAuthCheck: true });
        });

    gemini.command('first-real-test')
        .description('Run end-to-end test to verify parsing fidelity')
        .option('--local', 'Use local execution', false)
        .option('--model <name>', 'Gemini Model name')
        .action(async (opts, cmdObj) => {
            const options = getOptionsWithGlobals(cmdObj);
            const useServer = !options.local;
            
            const testPrompt = `Provide a comprehensive summary of Neural Scaling Laws with tables, LaTeX formulas, and citations.`.trim();

            console.log(`[CLI] 🚀 Starting First Real-World Test...`);
            
            if (useServer) {
                const serverUrl = options.server || cliContext.get().serverUrl;
                try {
                    await executeGeminiStream('research', { query: testPrompt }, { server: serverUrl }, (data: any) => {
                        if (data.type === 'progress' && data.text) {
                            process.stdout.write(data.text);
                        } else if (data.type === 'result') {
                            console.log('\n\n--- ✅ Test Result Received ---');
                            console.log(JSON.stringify(data.data, null, 2));
                        }
                    });
                } catch (e: any) {
                    console.error(`[CLI] ❌ Test failed: ${e.message}`);
                    process.exit(1);
                }
            } else {
                await runLocalGeminiAction(async (client, gemini) => {
                    if (opts.model) await gemini.setModel(opts.model);
                    await gemini.sendMessage(testPrompt, {
                        onProgress: (text: string) => process.stdout.write(text)
                    });
                });
            }
        });
}
