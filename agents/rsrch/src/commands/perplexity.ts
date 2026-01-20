import { Command } from 'commander';
import { PerplexityClient } from '../client';
import { cliContext } from '../cli-context';
import { login } from '../auth';
import * as fs from 'fs';
import { config } from '../config';

export const queryCommand = new Command('query')
    .argument('[query]')
    .description('Run a research query (standalone)')
    .option('--session <session>', 'Session ID')
    .option('--name <name>', 'Session Name')
    .option('--deep', 'Deep research mode')
    .option('--keep-alive', 'Keep browser open')
    .action(async (query, opts) => {
        const { profileId, cdpEndpoint } = cliContext.get();
        if (query) {
            const client = new PerplexityClient({ profileId, cdpEndpoint });
            await client.init({ keepAlive: opts.keepAlive, profileId, cdpEndpoint });
            try {
                await client.query(query, opts);
            } finally {
                await client.close();
            }
        } else {
            // Legacy mode (queries.json)
            if (fs.existsSync(config.paths.queriesFile)) {
                console.log('No query argument provided. Reading from queries.json...');
                const queries = JSON.parse(fs.readFileSync(config.paths.queriesFile, 'utf-8'));
                if (Array.isArray(queries)) {
                    const client = new PerplexityClient({ profileId, cdpEndpoint });
                    await client.init({ profileId, cdpEndpoint });
                    try {
                        for (const q of queries) {
                            await client.query(q, opts);
                        }
                    } finally {
                        await client.close();
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
        const { profileId, cdpEndpoint } = cliContext.get();
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

        console.log(`Found ${queries.length} queries in batch file.`);

        const client = new PerplexityClient({ profileId, cdpEndpoint });
        await client.init({ profileId, cdpEndpoint });

        try {
            for (let i = 0; i < queries.length; i++) {
                const q = queries[i];
                console.log(`\n[Batch ${i + 1}/${queries.length}] Processing: "${q}"`);
                await client.query(q, { sessionName: 'new-cli-session' });
            }
        } catch (error) {
            console.error('Batch processing failed:', error);
        } finally {
            console.log('\nBatch complete. Press Ctrl+C to exit and close browser.');
        }
    });

export const authCommand = new Command('auth')
    .description('Login to Perplexity (headless)')
    .action(async () => {
        const { profileId } = cliContext.get();
        const { getStateDir } = await import('../profile');
        const userDataDir = getStateDir(profileId);
        await login(userDataDir);
    });

export const loginCommand = new Command('login')
    .description('Interactive login for Docker/Remote')
    .action(async () => {
        const { profileId, cdpEndpoint } = cliContext.get();
        const client = new PerplexityClient({ profileId, cdpEndpoint });
        await client.init({ profileId, cdpEndpoint });

        console.log('Opening Perplexity for interactive login...');
        const ppUrl = 'https://www.perplexity.ai';
        await client.openPage(ppUrl);

        console.log('Opening NotebookLM for interactive login...');
        await client.openPage('https://notebooklm.google.com/');

        console.log('\nPLEASE LOG IN TO BOTH SERVICES VIA VNC (localhost:5900).');
        console.log('1. Log in to Perplexity in the first tab.');
        console.log('2. Log in to Google/NotebookLM in the second tab.');
        console.log('Press Enter here when you have successfully logged in to BOTH...');

        await new Promise(resolve => process.stdin.once('data', resolve));

        await client.saveAuth();
        console.log('Session saved! You can now use "query" or "batch".');
        process.exit(0);
    });
