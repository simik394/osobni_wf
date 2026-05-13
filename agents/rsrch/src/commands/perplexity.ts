import { Command } from 'commander';
import { sendServerRequest } from '../cli/utils';
import * as fs from 'fs';
import { config } from '../config';

export const queryCommand = new Command('query')
    .argument('[query]')
    .description('Run a research query (standalone)')
    .option('--session <session>', 'Session ID')
    .option('--name <name>', 'Session Name')
    .option('--deep', 'Deep research mode')
    .action(async (query, opts) => {
        if (query) {
            const result = await sendServerRequest('/perplexity/query', {
                query,
                sessionId: opts.session,
                name: opts.name,
                deep: opts.deep
            });
            if (result?.success) {
                console.log('\n--- Answer ---');
                console.log(result.answer || 'No answer found.');
                console.log('\nSource URL:', result.url);
            }
        } else {
            // Legacy mode (queries.json)
            if (fs.existsSync(config.paths.queriesFile)) {
                console.log('No query argument provided. Reading from queries.json...');
                const queries = JSON.parse(fs.readFileSync(config.paths.queriesFile, 'utf-8'));
                if (Array.isArray(queries)) {
                    const result = await sendServerRequest('/perplexity/batch', { queries });
                    if (result?.success) {
                        result.results.forEach((r: any, i: number) => {
                            console.log(`\n[Query ${i + 1}] Answer: ${r.answer?.substring(0, 100)}...`);
                        });
                    }
                } else {
                    console.error('queries.json should be an array of strings.');
                }
            } else {
                console.error('Please provide a query: rsrch query "Your question" [--session=ID] [--name=NAME]');
            }
        }
    });

export const batchCommand = new Command('batch')
    .argument('<file>')
    .description('Run batch queries from a file')
    .action(async (file) => {
        if (!fs.existsSync(file)) {
            console.error(`Batch file not found: ${file}`);
            process.exit(1);
        }

        const content = fs.readFileSync(file, 'utf-8');
        const queries = content.split('\n').map(line => line.trim()).filter(line => line.length > 0);

        if (queries.length === 0) {
            console.error('Batch file is empty.');
            process.exit(1);
        }

        console.log(`Found ${queries.length} queries in batch file. Dispatching to server...`);
        const result = await sendServerRequest('/perplexity/batch', { queries });
        if (result?.success) {
            console.log(`Batch complete. Processed ${result.results.length} queries.`);
        }
    });

export const authCommand = new Command('auth')
    .description('Check Perplexity auth status on server')
    .action(async () => {
        const result = await sendServerRequest('/perplexity/query', { query: 'test' });
        if (result?.success) console.log('✓ Perplexity authenticated');
        else console.log('✗ Perplexity auth failed');
    });

export const loginCommand = new Command('login')
    .description('Note: Use VNC dashboard for interactive login on server.')
    .action(() => {
        console.log('\nStateless CLI Migration: Interactive login is now managed on the server side.');
        console.log('Please use the VNC dashboard (localhost:5900) or server-side UI to log in.');
    });
