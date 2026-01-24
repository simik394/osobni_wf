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

export const vncCommand = new Command('vnc')
    .description('Open VNC connection to the production browser')
    .option('--host <host>', 'VNC host', 'halvarm')
    .option('--port <port>', 'VNC port', '5900')
    .option('--viewer <path>', 'Custom VNC viewer command')
    .action(async (opts) => {
        const { execSync } = await import('child_process');
        const target = `${opts.host}:${opts.port}`;

        console.log(`📡 Connecting to Browser VNC at ${target}...`);

        // List of common viewers to try
        const viewers = opts.viewer ? [opts.viewer] : ['vncviewer', 'tigervnc', 'gvncviewer', 'remote-viewer'];
        let activeViewer = '';

        for (const v of viewers) {
            try {
                execSync(`which ${v.split(' ')[0]}`, { stdio: 'ignore' });
                activeViewer = v;
                break;
            } catch (e) {
                continue;
            }
        }

        if (!activeViewer) {
            console.error('❌ No VNC viewer found on your system.');
            console.log('Please install one (e.g., tigervnc, xtightvncviewer) or specify one with --viewer.');
            console.log(`Manual command: vncviewer ${target}`);
            process.exit(1);
        }

        console.log(`🚀 Launching ${activeViewer}...`);
        try {
            // Using spawn so it runs in background/independently
            const { spawn } = await import('child_process');
            const child = spawn(activeViewer.split(' ')[0], [...activeViewer.split(' ').slice(1), target], {
                detached: true,
                stdio: 'ignore'
            });
            child.unref();
            console.log('✅ Viewer launched. Happy researching!');
        } catch (error: any) {
            console.error(`❌ Failed to launch viewer: ${error.message}`);
        }
    });

