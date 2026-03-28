import { Command } from 'commander';
import { startServer } from '../server';
import { sendServerRequest } from '../cli/utils';

export const serveCommand = new Command('serve')
    .description('Start HTTP server')
    .option('--port <number>', 'Port to listen on', '3055')
    .action(async (opts) => {
        if (opts.port) {
            process.env.PORT = opts.port;
        }
        await startServer();
        // Keep the process alive
        await new Promise(() => {});
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
