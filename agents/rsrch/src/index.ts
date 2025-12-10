#!/usr/bin/env node
import { login } from './auth';
import { PerplexityClient } from './client';
import { startServer } from './server';
import * as fs from 'fs';
import { config } from './config';
import * as path from 'path';
import { GeminiClient, ResearchInfo } from './gemini-client';

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
            if (!title) { console.error('Usage: rsrch notebook create "Title"'); process.exit(1); }

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

            if (!url) { console.error('Usage: rsrch notebook add-source "URL" [--notebook "Title"]'); process.exit(1); }

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
                console.error('Usage: rsrch notebook add-drive-source "Doc1,Doc2" [--notebook "Title"]');
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
                console.error('Usage: rsrch notebook download-audio [output_path] --notebook "Title" [--local]');
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
                console.error('Usage: rsrch notebook download-all-audio [output_dir] --notebook "Title" [--local]');
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
            console.log('  rsrch notebook create <Title>');
            console.log('  rsrch notebook add-source <URL> [--notebook <Title>]');
            console.log('  rsrch notebook add-drive-source <DocNames> [--notebook <Title>]');
            console.log('  rsrch notebook audio [--notebook <Title>] [--sources <list>] [--prompt <text>]');
            console.log('  rsrch notebook download-audio [output_path] --notebook <Title> [--local] [--headed]');
            console.log('  rsrch notebook download-all-audio [output_dir] --notebook <Title> [--local] [--headed]');
            console.log('');
            console.log('Flags:');
            console.log('  --local    Use local browser (required for Google services)');
            console.log('  --headed   Show browser window (default: headless)');
        }

    } else if (command === 'gemini') {
        const subArg1 = args[1]; // e.g. research
        const isLocalExecution = args.includes('--local');

        // Helper for local execution
        const runLocalGeminiAction = async (action: (client: PerplexityClient, gemini: any) => Promise<void>, sessionId?: string) => {
            console.log('Running Gemini in LOCAL mode...');
            const client = new PerplexityClient();
            await client.init();
            const gemini = await client.createGeminiClient();
            await gemini.init(sessionId); // Pass sessionId to navigate directly
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
                console.error('Usage: rsrch gemini research "Query" [--local]');
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
        } else if (subArg1 === 'deep-research') {
            // gemini deep-research "Query string" [--local]
            // Find query string (first non-flag arg after 'deep-research')
            let query = '';
            for (let i = 2; i < args.length; i++) {
                if (!args[i].startsWith('--')) {
                    query = args[i];
                    break;
                }
            }

            if (!query) {
                console.error('Usage: rsrch gemini deep-research "Query" [--local] [--headed]');
                process.exit(1);
            }

            if (isLocalExecution) {
                await runLocalGeminiAction(async (client, gemini) => {
                    console.log('\n[Deep Research] Starting...');
                    console.log('[Deep Research] This may take several minutes.');
                    console.log('[Deep Research] The research plan will be automatically confirmed.\n');

                    const result = await gemini.startDeepResearch(query);

                    console.log('\n--- Deep Research Result ---');
                    console.log(`Status: ${result.status}`);
                    if (result.googleDocId) {
                        console.log(`Google Doc ID: ${result.googleDocId}`);
                        console.log(`Google Doc URL: ${result.googleDocUrl}`);
                    }
                    if (result.error) {
                        console.log(`Error: ${result.error}`);
                    }
                    console.log('----------------------------\n');
                });
            } else {
                console.log('Server mode for deep-research not yet implemented. Use --local.');
            }
        } else if (subArg1 === 'open-session') {
            // gemini open-session "Session ID or Name" [--local]
            let identifier = '';
            for (let i = 2; i < args.length; i++) {
                if (!args[i].startsWith('--')) {
                    identifier = args[i];
                    break;
                }
            }

            if (!identifier) {
                console.error('Usage: rsrch gemini open-session "SessionID or Name" [--local] [--headed]');
                process.exit(1);
            }

            if (isLocalExecution) {
                await runLocalGeminiAction(async (client, gemini) => {
                    const success = await gemini.openSession(identifier);
                    if (success) {
                        const sessionId = gemini.getCurrentSessionId();
                        console.log(`\nSession opened: ${sessionId}`);
                        console.log(`URL: https://gemini.google.com/app/${sessionId}\n`);
                    } else {
                        console.error(`Failed to open session: ${identifier}`);
                    }
                });
            } else {
                console.log('Server mode for open-session not yet implemented. Use --local.');
            }
        } else if (subArg1 === 'export-to-docs') {
            // gemini export-to-docs [SessionID] [--local]
            // If no session ID provided, exports from current page
            let sessionId = '';
            for (let i = 2; i < args.length; i++) {
                if (!args[i].startsWith('--')) {
                    sessionId = args[i];
                    break;
                }
            }

            if (isLocalExecution) {
                await runLocalGeminiAction(async (client, gemini) => {
                    console.log('\nExporting to Google Docs...');
                    const result = await gemini.exportCurrentToGoogleDocs();

                    console.log('\n--- Export Result ---');
                    if (result.docId) {
                        console.log(`Google Doc ID: ${result.docId}`);
                        console.log(`Google Doc URL: ${result.docUrl}`);
                    } else {
                        console.log('Export failed - no document created');
                    }
                    console.log('---------------------\n');
                }, sessionId || undefined);
            } else {
                console.log('Server mode for export-to-docs not yet implemented. Use --local.');
            }
        } else if (subArg1 === 'list-sessions') {
            // gemini list-sessions [--local]
            if (isLocalExecution) {
                await runLocalGeminiAction(async (client, gemini) => {
                    const sessions = await gemini.listSessions();

                    console.log('\n--- Gemini Sessions ---');
                    if (sessions.length === 0) {
                        console.log('No sessions found in sidebar');
                    } else {
                        sessions.forEach((s: { name: string, id: string | null }, i: number) => {
                            console.log(`${i + 1}. ${s.name}${s.id ? ` (ID: ${s.id})` : ''}`);
                        });
                    }
                    console.log('-----------------------\n');
                });
            } else {
                console.log('Server mode for list-sessions not yet implemented. Use --local.');
            }
        } else if (subArg1 === 'send-message') {
            // gemini send-message [SessionID] "Message" [--local]
            // Parse session ID and message
            let sessionId = '';
            let message = '';
            const nonFlagArgs: string[] = [];

            for (let i = 2; i < args.length; i++) {
                if (!args[i].startsWith('--')) {
                    nonFlagArgs.push(args[i]);
                }
            }

            if (nonFlagArgs.length >= 2) {
                sessionId = nonFlagArgs[0];
                message = nonFlagArgs[1];
            } else if (nonFlagArgs.length === 1) {
                message = nonFlagArgs[0]; // No session ID, use current/new session
            }

            if (!message) {
                console.error('Usage: rsrch gemini send-message [SessionID] "Message" [--local] [--headed]');
                process.exit(1);
            }

            if (isLocalExecution) {
                await runLocalGeminiAction(async (client, gemini) => {
                    const response = await gemini.sendMessage(message);

                    console.log('\n--- Response ---');
                    if (response) {
                        console.log(response);
                    } else {
                        console.log('No response received');
                    }
                    console.log('----------------\n');

                    // Show session ID for reference
                    const currentId = gemini.getCurrentSessionId();
                    if (currentId) {
                        console.log(`Session: ${currentId}`);
                    }
                }, sessionId || undefined);
            } else {
                console.log('Server mode for send-message not yet implemented. Use --local.');
            }
        } else if (subArg1 === 'get-response') {
            // gemini get-response [SessionID] [Index] [--local]
            // Index: 1 = first, -1 = last (default)
            let sessionId = '';
            let index = -1; // Default to last response
            const nonFlagArgs: string[] = [];

            for (let i = 2; i < args.length; i++) {
                if (!args[i].startsWith('--')) {
                    nonFlagArgs.push(args[i]);
                }
            }

            if (nonFlagArgs.length >= 2) {
                sessionId = nonFlagArgs[0];
                index = parseInt(nonFlagArgs[1]) || -1;
            } else if (nonFlagArgs.length === 1) {
                // Could be session ID or index
                const parsed = parseInt(nonFlagArgs[0]);
                if (!isNaN(parsed)) {
                    index = parsed;
                } else {
                    sessionId = nonFlagArgs[0];
                }
            }

            if (isLocalExecution) {
                await runLocalGeminiAction(async (client, gemini) => {
                    const response = await gemini.getResponse(index);

                    console.log(`\n--- Response (index: ${index}) ---`);
                    if (response) {
                        console.log(response);
                    } else {
                        console.log('No response found at that index');
                    }
                    console.log('----------------------------------\n');
                }, sessionId || undefined);
            } else {
                console.log('Server mode for get-response not yet implemented. Use --local.');
            }
        } else if (subArg1 === 'get-responses') {
            // gemini get-responses [SessionID] [--local]
            let sessionId = '';
            for (let i = 2; i < args.length; i++) {
                if (!args[i].startsWith('--')) {
                    sessionId = args[i];
                    break;
                }
            }

            if (isLocalExecution) {
                await runLocalGeminiAction(async (client, gemini) => {
                    const responses = await gemini.getResponses();

                    console.log('\n--- All Responses ---');
                    if (responses.length === 0) {
                        console.log('No responses found');
                    } else {
                        responses.forEach((r: string, i: number) => {
                            console.log(`\n[Response ${i + 1}]`);
                            console.log(r.substring(0, 500) + (r.length > 500 ? '...' : ''));
                        });
                    }
                    console.log('---------------------\n');
                }, sessionId || undefined);
            } else {
                console.log('Server mode for get-responses not yet implemented. Use --local.');
            }
        } else if (subArg1 === 'get-research-info') {
            // gemini get-research-info [SessionID] [--local]
            let sessionId = '';
            for (let i = 2; i < args.length; i++) {
                if (!args[i].startsWith('--')) {
                    sessionId = args[i];
                    break;
                }
            }

            if (isLocalExecution) {
                await runLocalGeminiAction(async (client, gemini) => {
                    const info = await gemini.getResearchInfo();

                    console.log('\n--- Research Info ---');
                    console.log(`Session ID: ${info.sessionId || 'N/A'}`);
                    console.log(`Title: ${info.title || 'Not found'}`);
                    console.log(`First Heading: ${info.firstHeading || 'Not found'}`);
                    console.log('---------------------\n');

                    // Output as JSON for easy parsing
                    console.log('JSON:', JSON.stringify(info, null, 2));
                }, sessionId || undefined);
            } else {
                console.log('Server mode for get-research-info not yet implemented. Use --local.');
            }
        } else if (subArg1 === 'list-sessions') {
            // gemini list-sessions [Limit] [Offset] [--local]
            let limit = 20;
            let offset = 0;

            // Parse positional args
            const nonFlags = args.slice(2).filter(a => !a.startsWith('--'));
            if (nonFlags.length > 0) limit = parseInt(nonFlags[0]) || 20;
            if (nonFlags.length > 1) offset = parseInt(nonFlags[1]) || 0;

            if (isLocalExecution) {
                await runLocalGeminiAction(async (client, gemini) => {
                    const sessions = await gemini.listSessions(limit, offset);
                    console.log(`\n--- Recent Sessions (Limit: ${limit}, Offset: ${offset}) ---`);
                    sessions.forEach((s: { name: string; id: string | null }) => console.log(`- ${s.name} (ID: ${s.id || 'N/A'})`));
                    console.log('JSON:', JSON.stringify(sessions));
                });
            } else {
                console.log('Server mode for list-sessions not yet implemented. Use --local.');
            }
        } else if (subArg1 === 'list-research-docs') {
            // gemini list-research-docs [Limit | SessionID] [--local]
            let limit = 10;
            let sessionId: string | undefined = undefined;

            for (let i = 2; i < args.length; i++) {
                if (!args[i].startsWith('--')) {
                    if (!isNaN(parseInt(args[i]))) {
                        limit = parseInt(args[i]);
                    } else {
                        sessionId = args[i];
                    }
                    break;
                }
            }

            if (isLocalExecution) {
                await runLocalGeminiAction(async (client, gemini) => {
                    let docs: ResearchInfo[] = [];
                    if (sessionId) {
                        console.log(`[CLI] Listing research docs for session: ${sessionId}`);
                        // runLocalGeminiAction already handles navigation if sessionId is passed to it,
                        // but here we are inside the callback.
                        // However, runLocalGeminiAction takes sessionId as 2nd arg.
                        // We need to pass it there, or handle navigation here.
                        // If we pass it to runLocalGeminiAction, it opens it.
                        // But runLocalGeminiAction is called with `sessionId || undefined` from the outer scope?
                        // No, here we are determining sessionId inside the block.

                        // We can manually navigate
                        await gemini.openSession(sessionId);
                        docs = await gemini.getAllResearchDocsInSession();
                    } else {
                        docs = await gemini.listDeepResearchDocuments(limit);
                    }

                    console.log('\n--- Deep Research Documents ---');
                    if (docs.length === 0) {
                        console.log('No Deep Research documents found.');
                    } else {
                        docs.forEach((doc: ResearchInfo, idx: number) => {
                            console.log(`\n[Document ${idx + 1}]`);
                            console.log(`Title: ${doc.title}`);
                            console.log(`First Heading: ${doc.firstHeading}`);
                            console.log(`Session ID: ${doc.sessionId}`);
                        });
                    }
                    console.log('-------------------------------\n');
                    console.log('JSON:', JSON.stringify(docs, null, 2));

                }); // Note: we are NOT passing sessionId to runLocalGeminiAction because we handle it manually if needed, or we want 'fresh' start if crawling.
            } else {
                console.log('Server mode for list-research-docs not yet implemented. Use --local.');
            }
        } else {
            console.log('Gemini commands:');
            console.log('  rsrch gemini research "Query" [--local]');
            console.log('  rsrch gemini deep-research "Query" [--local] [--headed]');
            console.log('  rsrch gemini send-message [SessionID] "Message" [--local] [--headed]');
            console.log('  rsrch gemini get-response [SessionID] [Index] [--local]  # Index: 1=first, -1=last');
            console.log('  rsrch gemini get-responses [SessionID] [--local]');
            console.log('  rsrch gemini get-research-info [SessionID] [--local]  # Get title and first heading');
            console.log('  rsrch gemini list-research-docs [Limit | SessionID] [--local] # List recent research docs');
            console.log('  rsrch gemini open-session "ID or Name" [--local] [--headed]');
            console.log('  rsrch gemini export-to-docs [SessionID] [--local] [--headed]');
            console.log('  rsrch gemini list-sessions [Limit] [Offset] [--local]');
            console.log('');
            console.log('Flags:');
            console.log('  --local    Use local browser (required for Google services)');
            console.log('  --headed   Show browser window (default: headless)');
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
        console.log('  rsrch gemini <cmd> ...           - Gemini commands (research, deep-research, sessions...)');
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
            console.error('Please provide a batch file: rsrch batch queries.txt');
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
            console.error('Please provide a query: rsrch query "Your question" [--session=ID] [--name=NAME]');
        }
    }
}

main().catch(console.error);
