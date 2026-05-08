import { Command } from 'commander';
import { registerKeepCommands } from './keep.cmd';

export const keepCommand = new Command('keep')
    .description('Manage Google Keep notes');

registerKeepCommands(keepCommand);
