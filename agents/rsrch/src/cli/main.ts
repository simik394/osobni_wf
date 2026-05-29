#!/usr/bin/env node
import { Command } from 'commander';
import { cliContext } from './context';
import { config } from '../config';
import { serveCommand, stopCommand, shutdownCommand } from '../commands/server';
import { profileCommand } from '../commands/profile';
import { geminiCommand } from '../commands/gemini/index';
import { notebookCommand } from '../commands/notebooklm';
import { queryCommand, batchCommand, authCommand, loginCommand } from '../commands/perplexity';
import { graphCommand } from '../commands/graph';
import { registryCommand } from '../commands/registry';
import { aimodeCommand } from '../commands/aimode';
import { keepCommand } from '../commands/keep';
import { gdocsCommand } from '../commands/gdocs';
import { unifiedCommand, watchCommand, notifyCommand, vncCommand } from '../commands/misc';
import { statusCommand } from '../commands/status';
import { verifyCommand } from '../commands/verify';
import { initTelemetry, shutdownTelemetry } from '../core/telemetry';

const program = new Command();

program
    .version('1.0.35')
    .option('--profile <profileId>', 'Profile ID to use', 'default')
    .option('--server <url>', 'Server URL for API calls', process.env.RSRCH_SERVER_URL || `http://${config.host}:${config.port}`)
    .option('-v, --verbose', 'Enable verbose output', false)
    .hook('preAction', (thisCommand) => {
        const opts = thisCommand.opts();
        cliContext.set({
            profileId: opts.profile,
            serverUrl: opts.server,
            verbose: opts.verbose
        });
    });

// Root Commands
program.addCommand(authCommand);
program.addCommand(loginCommand);
program.addCommand(serveCommand);
program.addCommand(stopCommand);
program.addCommand(shutdownCommand);
program.addCommand(queryCommand);
program.addCommand(batchCommand);
program.addCommand(unifiedCommand);
program.addCommand(watchCommand);
program.addCommand(notifyCommand);
program.addCommand(vncCommand);
program.addCommand(statusCommand);
program.addCommand(verifyCommand);

// Command Groups
program.addCommand(profileCommand);
program.addCommand(notebookCommand);
program.addCommand(geminiCommand);
program.addCommand(graphCommand);
program.addCommand(registryCommand);
program.addCommand(aimodeCommand);
program.addCommand(keepCommand);
program.addCommand(gdocsCommand);

async function main() {
    try {
        await initTelemetry();
        await program.parseAsync(process.argv);
    } catch (error) {
        console.error(error);
        process.exit(1);
    } finally {
        await shutdownTelemetry();
    }
}

main();
