import { login } from './auth';
import { PerplexityClient } from './client';
import { startServer } from './server';
import * as fs from 'fs';
import { config } from './config';

const args = process.argv.slice(2);
const command = args[0];

function parseArgs(args: string[]) {
    const options: any = {};
    const queryParts: string[] = [];

    for (let i = 1; i < args.length; i++) {
        const arg = args[i];
        if (arg.startsWith('--session=')) {
            options.session = arg.split('=')[1];
        } else if (arg.startsWith('--name=')) {
            options.name = arg.split('=')[1];
        } else {
            queryParts.push(arg);
        }
    }
    return {
        query: queryParts.join(' '),
        options
    };
}

async function main() {
    if (command === 'auth') {
        await login();
    } else if (command === 'login') {
        // Interactive login in Docker/Remote
        const client = new PerplexityClient();
        await client.init();

        console.log('Opening Perplexity for interactive login...');
        await client.query('Login page', { session: 'login' }); // Just to open a tab

        console.log('\nPLEASE LOG IN VIA VNC (localhost:5900).');
        console.log('Press Enter here when you have successfully logged in...');

        await new Promise(resolve => process.stdin.once('data', resolve));

        await client.saveAuth();
        console.log('Session saved! You can now use "query" or "batch".');
        // Don't close, let user decide when to stop container or just exit process
        process.exit(0);
    } else if (command === 'serve') {
        await startServer();
    } else if (command === 'batch') {
        const batchFile = args[1];
        if (!batchFile) {
            console.error('Please provide a batch file: npm run batch queries.txt');
            process.exit(1);
        }

        if (!fs.existsSync(batchFile)) {
            console.error(`Batch file not found: ${batchFile}`);
            process.exit(1);
        }

        const content = fs.readFileSync(batchFile, 'utf-8');
        const queries = content.split('\n').map(line => line.trim()).filter(line => line.length > 0);

        if (queries.length === 0) {
            console.error('Batch file is empty.');
            process.exit(1);
        }

        console.log(`Found ${queries.length} queries in batch file.`);

        const client = new PerplexityClient();
        await client.init();

        try {
            for (let i = 0; i < queries.length; i++) {
                const q = queries[i];
                console.log(`\n[Batch ${i + 1}/${queries.length}] Processing: "${q}"`);
                // Use a new session for each query in the batch, or maybe named sessions?
                // User said "paste them sequentially in separate tabs".
                // My default logic creates a new session if no session is specified.
                // So calling query(q) will create a new tab for each.
                await client.query(q, { session: 'new' });
            }
        } catch (error) {
            console.error('Batch processing failed:', error);
        } finally {
            // Keep browser open if it's a server? No, this is CLI.
            // But user wants to see them.
            // If we close, they are gone.
            // The client.close() kills the browser.
            // If we want to keep them open for VNC inspection, we shouldn't close.
            // But the script needs to exit?
            // If we are connecting to a remote browser (Docker), client.close() closes the context/browser?
            // Let's check client.ts close() method.
            // It closes pages, context, and browser.

            // If running against Docker server, we probably want to leave the tabs open.
            // But client.ts logic is:
            // if (process.env.BROWSER_WS_ENDPOINT) ... connect ...
            // close() -> browser.close()

            // If we want to persist, we should NOT call client.close() if we want to inspect.
            // But then the node process hangs?
            // Maybe we add a flag --keep-open?
            // Or just don't close if it's a batch?

            // For now, I will NOT close the client if it's a batch, so the user can inspect.
            // But the script will hang until user kills it.
            console.log('\nBatch complete. Press Ctrl+C to exit and close browser.');
            // await client.close(); 
        }
    } else if (command === 'query') {
        const { query, options } = parseArgs(args);

        if (query) {
            const client = new PerplexityClient();
            await client.init();
            try {
                await client.query(query, options);
            } finally {
                await client.close();
            }
        } else {
            // Check if queries.json exists and run batch
            if (fs.existsSync(config.paths.queriesFile)) {
                console.log('No query argument provided. Reading from queries.json...');
                const queries = JSON.parse(fs.readFileSync(config.paths.queriesFile, 'utf-8'));
                if (Array.isArray(queries)) {
                    const client = new PerplexityClient();
                    await client.init();
                    try {
                        for (const q of queries) {
                            await client.query(q, options);
                        }
                    } finally {
                        await client.close();
                    }
                } else {
                    console.error('queries.json should be an array of strings.');
                }
            } else {
                console.error('Please provide a query: npm run query "Your question" [--session=ID] [--name=NAME]');
            }
        }
    } else {
        console.log('Usage:');
        console.log('  npm run auth             - Login to Perplexity');
        console.log('  npm run serve            - Start HTTP server (long-running service)');
        console.log('  npm run query "Question" - Run a single query');
        console.log('  npm run query            - Run queries from data/queries.json');
        console.log('    Options: --session=ID|new|latest, --name=NAME');
        console.log('  npm run batch file.txt   - Run queries from a file (one per line)');
    }
}

main().catch(console.error);
