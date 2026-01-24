#!/usr/bin/env node
import { Command } from 'commander';
import { cliContext } from './cli-context';
import { serveCommand, stopCommand, shutdownCommand } from './commands/server';
import { profileCommand } from './commands/profile';
import { geminiCommand } from './commands/gemini';
import { notebookCommand } from './commands/notebooklm';
import { queryCommand, batchCommand, authCommand, loginCommand } from './commands/perplexity';
import { graphCommand } from './commands/graph';
import { registryCommand } from './commands/registry';
import { unifiedCommand, watchCommand, notifyCommand, vncCommand } from './commands/misc';

const program = new Command();

program
    .version('1.0.35')
    .option('--profile <profileId>', 'Profile ID to use', 'default')
    .option('--cdp <url>', 'CDP Endpoint URL (for --local mode)')
    .option('--server <url>', 'Server URL for API calls', process.env.RSRCH_SERVER_URL || 'http://localhost:3001')
    .option('--local', 'Use local browser instead of server (dev only)', false)
    .option('-v, --verbose', 'Enable verbose output', false)
    .hook('preAction', (thisCommand) => {
        const opts = thisCommand.opts();
        cliContext.set({
            profileId: opts.profile,
            cdpEndpoint: opts.cdp,
            serverUrl: opts.server,
            local: opts.local,
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

// Command Groups
program.addCommand(profileCommand);
program.addCommand(notebookCommand);
program.addCommand(geminiCommand);
program.addCommand(graphCommand);
program.addCommand(registryCommand);

program.parse(process.argv);
