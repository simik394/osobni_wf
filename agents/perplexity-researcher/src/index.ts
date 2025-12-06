#!/usr/bin/env node
import { login } from './auth';
import { PerplexityClient } from './client';
import { startServer } from './server';
import * as fs from 'fs';
import { config } from './config';
import * as path from 'path';

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

    if (command === 'auth') {
        await login();
    } else if (command === 'login') {
        const client = new PerplexityClient();
        await client.init();

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
    } else if (command === 'serve') {
        await startServer();
    } else if (command === 'stop') {
        await sendServerRequest('/shutdown');

    } else if (command === 'notebook') {
        // notebook audio [--notebook "Title"] [--sources "a,b"] [--prompt "..."]

        const isLocalExecution = (argv?: any) => args.includes('--local');

        const runLocalNotebookAction = async (argv: any, action: (client: PerplexityClient, notebook: any) => Promise<void>) => {
            console.log('Running in LOCAL mode...');
            const client = new PerplexityClient();
            await client.init();
            const notebook = await client.createNotebookClient();
            try {
                await action(client, notebook);
            } finally {
                await client.close();
            }
        };

        if (subArg1 === 'create') {
            const title = subArg2;
            if (!title) { console.error('Usage: notebook create "Title"'); process.exit(1); }

            if (isLocalExecution()) {
                await runLocalNotebookAction({}, async (client, notebook) => {
                    await notebook.createNotebook(title);
                });
            } else {
                await sendServerRequest('/notebook/create', { title });
            }

        } else if (subArg1 === 'add-source') {
            const url = subArg2;
            let notebookTitle = undefined;
            if (args[3] === '--notebook') notebookTitle = args[4];

            if (!url) { console.error('Usage: notebook add-source "URL" [--notebook "Title"]'); process.exit(1); }

            if (isLocalExecution()) {
                await runLocalNotebookAction({}, async (client, notebook) => {
                    if (notebookTitle) {
                        await notebook.openNotebook(notebookTitle);
                    }
                    await notebook.addSourceUrl(url);
                });
            } else {
                await sendServerRequest('/notebook/add-source', { url, notebookTitle });
            }

        } else if (subArg1 === 'add-drive-source') {
            let notebookTitle = undefined;
            let docNames: string[] = [];

            // First positional arg is doc names (comma-separated)
            if (subArg2) {
                docNames = subArg2.split(',').map(s => s.trim()).filter(s => s.length > 0);
            }

            for (let i = 3; i < args.length; i++) {
                if (args[i] === '--notebook') {
                    notebookTitle = args[i + 1];
                    i++;
                }
            }

            if (docNames.length === 0) {
                console.error('Usage: notebook add-drive-source "Doc1,Doc2" [--notebook "Title"]');
                process.exit(1);
            }

            if (isLocalExecution()) {
                await runLocalNotebookAction({}, async (client, notebook) => {
                    await notebook.addSourceFromDrive(docNames, notebookTitle);
                });
            } else {
                await sendServerRequest('/notebook/add-drive-source', { docNames, notebookTitle });
            }

        } else if (subArg1 === 'audio') {
            let notebookTitle = undefined;
            let sources: string[] = [];
            let customPrompt: string | undefined = undefined;

            for (let i = 2; i < args.length; i++) {
                if (args[i] === '--notebook') {
                    notebookTitle = args[i + 1];
                    i++;
                } else if (args[i] === '--sources') {
                    const rawSources = args[i + 1];
                    if (rawSources) {
                        sources = rawSources.split(',').map(s => s.trim()).filter(s => s.length > 0);
                    }
                    i++;
                } else if (args[i] === '--prompt') {
                    customPrompt = args[i + 1];
                    i++;
                } else if (args[i] === '--local') {
                    // Consume --local flag
                }
            }

            if (isLocalExecution()) {
                await runLocalNotebookAction({}, async (client, notebook) => {
                    await notebook.generateAudioOverview(notebookTitle, sources, customPrompt);
                });
            } else {
                await sendServerRequest('/notebook/generate-audio', { notebookTitle, sources, customPrompt });
            }
        } else if (subArg1 === 'download-audio') {
            // notebook download-audio [output_path] --notebook <Title> [--local]
            let notebookTitle: string | undefined = undefined;
            let outputPath: string = 'audio_overview.mp3'; // Default output path

            // subArg2 is the optional output path
            if (subArg2 && !subArg2.startsWith('--')) {
                outputPath = subArg2;
            }

            for (let i = 2; i < args.length; i++) {
                if (args[i] === '--notebook') {
                    notebookTitle = args[i + 1];
                    i++;
                } else if (args[i] === '--local') {
                    // Consume --local flag
                } else if (i === 2 && !args[i].startsWith('--')) {
                    // Already handled subArg2 as output path
                } else if (args[i].startsWith('--')) {
                    // Unknown flag, or flag already handled but we just skip for basic parser
                }
            }

            if (!notebookTitle) {
                console.error('Usage: notebook download-audio [output_path] --notebook "Title" [--local]');
                process.exit(1);
            }

            if (isLocalExecution()) {
                await runLocalNotebookAction({}, async (client, notebook) => {
                    const resolvedOutputPath = path.resolve(process.cwd(), outputPath);
                    await notebook.downloadAudio(notebookTitle as string, resolvedOutputPath);
                });
            } else {
                console.log('Server implementation for download-audio not yet available. Use --local.');
            }

        } else if (subArg1 === 'download-all-audio') {
            // notebook download-all-audio [output_dir] --notebook <Title> [--local]
            let notebookTitle: string | undefined = undefined;
            let outputDir: string = './audio_downloads'; // Default output directory

            // subArg2 is the optional output directory
            if (subArg2 && !subArg2.startsWith('--')) {
                outputDir = subArg2;
            }

            for (let i = 2; i < args.length; i++) {
                if (args[i] === '--notebook') {
                    notebookTitle = args[i + 1];
                    i++;
                } else if (args[i] === '--local') {
                    // Consume --local flag
                } else if (i === 2 && !args[i].startsWith('--')) {
                    // Already handled subArg2 as output directory
                } else if (args[i].startsWith('--')) {
                    // Unknown flag, or flag already handled but we just skip for basic parser
                }
            }

            if (!notebookTitle) {
                console.error('Usage: notebook download-all-audio [output_dir] --notebook "Title" [--local]');
                process.exit(1);
            }

            if (isLocalExecution()) {
                await runLocalNotebookAction({}, async (client, notebook) => {
                    const resolvedOutputDir = path.resolve(process.cwd(), outputDir);
                    const downloaded = await notebook.downloadAllAudio(notebookTitle as string, resolvedOutputDir);
                    console.log(`\n✅ Downloaded ${downloaded.length} audio file(s) to ${resolvedOutputDir}`);
                    downloaded.forEach((f: string) => console.log(`  - ${path.basename(f)}`));
                });
            } else {
                console.log('Server implementation for download-all-audio not yet available. Use --local.');
            }

        } else {
            console.log('Notebook commands:');
            console.log('  notebook create <Title>');
            console.log('  notebook add-source <URL> [--notebook <Title>]');
            console.log('  notebook add-drive-source <DocNames> [--notebook <Title>]');
            console.log('  notebook audio [--notebook <Title>] [--sources <list>] [--prompt <text>]');
            console.log('  notebook download-audio [output_path] --notebook <Title> [--local] [--headed]');
            console.log('  notebook download-all-audio [output_dir] --notebook <Title> [--local] [--headed]');
            console.log('');
            console.log('Flags:');
            console.log('  --local    Use local browser (required for Google services)');
            console.log('  --headed   Show browser window (default: headless)');
        }

    } else if (command === 'gemini') {
        const subArg1 = args[1]; // e.g. research
        const isLocalExecution = args.includes('--local');

        // Helper for local execution
        const runLocalGeminiAction = async (action: (client: PerplexityClient, gemini: any) => Promise<void>) => {
            console.log('Running Gemini in LOCAL mode...');
            const client = new PerplexityClient();
            await client.init();
            const gemini = await client.createGeminiClient();
            await gemini.init();
            try {
                await action(client, gemini);
            } finally {
                await client.close();
            }
        };

        if (subArg1 === 'research') {
            // gemini research "Query string" [--local]
            // Find query string (first non-flag arg after 'research')
            let query = '';
            for (let i = 2; i < args.length; i++) {
                if (!args[i].startsWith('--')) {
                    query = args[i];
                    break;
                }
            }

            if (!query) {
                console.error('Usage: gemini research "Query" [--local]');
                process.exit(1);
            }

            if (isLocalExecution) {
                await runLocalGeminiAction(async (client, gemini) => {
                    const response = await gemini.research(query);
                    console.log('\n--- Gemini Response ---\n');
                    console.log(response);
                    console.log('\n-----------------------\n');
                });
            } else {
                await sendServerRequest('/gemini/research', { query });
            }
        } else {
            console.log('Gemini commands:');
            console.log('  rsrch gemini research "Query" [--local]');
        }

    } else if (command === 'query') {
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
        console.log('  rsrch auth                       - Login to Perplexity');
        console.log('  rsrch login                      - Interactive login for Docker/Remote');
        console.log('  rsrch serve                      - Start HTTP server');
        console.log('  rsrch stop                       - Stop running server');
        console.log('  rsrch notebook <cmd> ...         - Manage NotebookLM (requires server)');
        console.log('  rsrch gemini research "Question" - Research with Gemini');
        console.log('  rsrch query "Question"           - Run localized query (standalone)');
        console.log('  rsrch query                      - Run queries from data/queries.json (standalone)');
        console.log('    Options: --session=ID|new|latest, --name=NAME');
        console.log('  rsrch batch file.txt             - Run batch queries from a file (standalone)');
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
