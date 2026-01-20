import { Command } from 'commander';
import { startServer } from '../server';
import { sendServerRequest } from '../cli-utils';

export const serveCommand = new Command('serve')
    .description('Start HTTP server')
    .action(async () => {
        await startServer();
    });

export const stopCommand = new Command('stop')
    .description('Stop running server')
    .action(async () => {
        await sendServerRequest('/shutdown');
    });

export const shutdownCommand = new Command('shutdown')
    .description('Force close persistent browser')
    .action(async () => {
        await sendServerRequest('/shutdown');
    });
