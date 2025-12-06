import { login } from './auth';
import { PerplexityClient } from './client';
import { startServer } from './server';
import * as fs from 'fs';
import { config } from './config';

const args = process.argv.slice(2);
const command = args[0];

// Helper to send request to server
async function sendServerRequest(path: string, body: any = {}) {
    const port = config.port;
    const url = `http://localhost:${port}${path}`;
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const err = await response.text();
            throw new Error(`Server error: ${response.status} ${err}`);
        }

        const data = await response.json();
        console.log(JSON.stringify(data, null, 2));
    } catch (e: any) {
        console.error(`Failed to communicate with server at port ${port}. Is it running?`);
        console.error(e.message);
        process.exit(1);
    }
}

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
    // Basic args parsing for subcommands
    const subArg1 = args[1]; // e.g. create, add-source
    const subArg2 = args[2];

    // Config Port Override via args?
    // We already load from file. 
    // args override is harder with this simple parsing, relying on config file is safer for now.

    if (command === 'auth') {
        await login();
    } else if (command === 'login') {
        // Interactive login in Docker/Remote
        const client = new PerplexityClient();
        await client.init();

        console.log('Opening Perplexity for interactive login...');
        console.log('Opening Perplexity for interactive login...');
        const ppUrl = 'https://www.perplexity.ai'; // or config.url
        await client.openPage(ppUrl); // Opens Perplexity safely

        console.log('Opening NotebookLM for interactive login...');
        await client.openPage('https://notebooklm.google.com/');

        console.log('\nPLEASE LOG IN TO BOTH SERVICES VIA VNC (localhost:5900).');
        console.log('1. Log in to Perplexity in the first tab.');
        console.log('2. Log in to Google/NotebookLM in the second tab.');
        console.log('Press Enter here when you have successfully logged in to BOTH...');

        await new Promise(resolve => process.stdin.once('data', resolve));

        await client.saveAuth();
        console.log('Session saved! You can now use "query" or "batch".');
        // Don't close, let user decide when to stop container or just exit process
        process.exit(0);
    } else if (command === 'serve') {
        await startServer();
    } else if (command === 'stop') {
        await sendServerRequest('/shutdown');

    } else if (command === 'notebook') {
        // notebook create "Title"
        // notebook add-source "URL" [--notebook "Title"]
        // notebook audio [--notebook "Title"]

        if (subArg1 === 'create') {
            const title = subArg2;
            if (!title) { console.error('Usage: notebook create "Title"'); process.exit(1); }
            await sendServerRequest('/notebook/create', { title });

        } else if (subArg1 === 'add-source') {
            const url = subArg2;
            let notebookTitle = undefined;
            if (args[3] === '--notebook') notebookTitle = args[4];

            if (!url) { console.error('Usage: notebook add-source "URL" [--notebook "Title"]'); process.exit(1); }
            await sendServerRequest('/notebook/add-source', { url, notebookTitle });

        } else if (subArg1 === 'audio') {
            let notebookTitle = undefined;
            let sources: string[] = [];

            for (let i = 2; i < args.length; i++) {
                if (args[i] === '--notebook') {
                    notebookTitle = args[i + 1];
                    i++;
                } else if (args[i] === '--sources') {
                    // Split by comma and trim
                    const rawSources = args[i + 1];
                    if (rawSources) {
                        sources = rawSources.split(',').map(s => s.trim()).filter(s => s.length > 0);
                    }
                    i++;
                }
            }

            await sendServerRequest('/notebook/generate-audio', { notebookTitle, sources });
        } else {
            console.log('Notebook commands:');
            console.log('  notebook create <Title>');
            console.log('  notebook add-source <URL> [--notebook <Title>]');
            console.log('  notebook audio [--notebook <Title>]');
        }

    } else if (command === 'query') {
        // Keep existing query logic? 
        // User asked for "accessible from cli tool".
        // Maybe query should also hit server if running?
        // But query has a "standalone" legacy.
        // Let's keep query as standalone for now unless requested otherwise, 
        // to preserve "batch" functionality without server.
        // But for consistency, having a CLI tool that does EVERYTHING via server is creating "one way".

        const { query, options } = parseArgs(args);
        if (query) {
            const client = new PerplexityClient();
            await client.init();
            try { await client.query(query, options); } finally { await client.close(); }
        } else {
            // If no direct query, fall back to legacy mode (queries.json or error)
            await runLegacyMode();
        }
    } else if (command === 'batch') {
        // Keep legacy batch
        await runLegacyMode();
    } else {
        console.log('Usage:');
        console.log('  auth                       - Login to Perplexity');
        console.log('  login                      - Interactive login for Docker/Remote');
        console.log('  serve                      - Start HTTP server');
        console.log('  stop                       - Stop running server');
        console.log('  notebook <cmd> ...         - Manage NotebookLM (requires server)');
        console.log('  query "Question"           - Run localized query (standalone)');
        console.log('  query                      - Run queries from data/queries.json (standalone)');
        console.log('    Options: --session=ID|new|latest, --name=NAME');
        console.log('  batch file.txt             - Run batch queries from a file (standalone)');
    }
}

// ... Copying Legacy Logic Function
async function runLegacyMode() {
    const { query, options } = parseArgs(args);
    if (command === 'batch') {
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
                await client.query(q, { session: 'new' });
            }
        } catch (error) {
            console.error('Batch processing failed:', error);
        } finally {
            console.log('\nBatch complete. Press Ctrl+C to exit and close browser.');
        }
    } else if (command === 'query') {
        // This part handles the case where 'query' is called without a direct query string,
        // implying a fallback to queries.json
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
}

main().catch(console.error);
