import { Command } from 'commander';
import { sendServerRequest } from '../cli-utils';
import * as path from 'path';

export const unifiedCommand = new Command('unified')
    .argument('<query>')
    .description('Run One-Click Research-to-Podcast flow')
    .option('--prompt <prompt>', 'Custom prompt')
    .option('--dry-run', 'Dry run')
    .action(async (query, opts) => {
        await sendServerRequest('/research-to-podcast', { query, customPrompt: opts.prompt, dryRun: opts.dryRun });
        console.log("\nUnified flow started! 🚀");
        console.log("Check server logs or Discord for progress updates.");
    });

export const watchCommand = new Command('watch')
    .description('Watch for research and generate audio')
    .option('--audio', 'Generate audio inline')
    .option('--queue', 'Submit to server queue')
    .option('--folder <path>', 'Audio folder path')
    .option('--once', 'Run once and exit')
    .action(async (opts) => {
        if (!opts.audio && !opts.queue && !opts.once) {
            console.log('Usage: rsrch watch [--audio | --queue] [--folder PATH] [--once]');
            process.exit(0);
        }

        const { watchForResearch, checkAndProcess } = await import('../watcher');
        const audioFolder = opts.folder || process.env.HOME + '/research/audio';

        if (opts.once) {
            await checkAndProcess({ generateAudio: opts.audio, submitToQueue: opts.queue, audioFolder });
        } else {
            await watchForResearch({ generateAudio: opts.audio, submitToQueue: opts.queue, audioFolder });
        }
    });

export const notifyCommand = new Command('notify')
    .argument('<message>')
    .description('Send a notification')
    .option('--title <title>', 'Notification title')
    .option('--priority <level>', 'Priority (low|default|high|urgent)', 'default')
    .action(async (message, opts) => {
        const { sendNotification, loadConfigFromEnv } = await import('../notify');
        loadConfigFromEnv();
        console.log(`📬 Sending notification: "${message}"`);
        const results = await sendNotification(message, { title: opts.title, priority: opts.priority });
        console.log('Results:', results);
    });
