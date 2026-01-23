import { Command } from 'commander';
import { WindmillClient } from '../clients/windmill';
import {
    sendServerRequest,
    sendServerRequestWithSSE,
    runLocalGeminiAction,
    executeGeminiGet,
    executeGeminiCommand,
    executeGeminiStream,
    getOptionsWithGlobals
} from '../cli-utils';
import { ResearchInfo } from '../gemini-client';
import { cliContext } from '../cli-context';
import * as fs from 'fs';
import * as path from 'path';
import type { PerplexityClient } from '../client';
import type { GeminiClient } from '../gemini-client';
import { getGraphStore } from '../graph-store';

const gemini = new Command('gemini').description('Gemini commands');

gemini.command('research <query>')
    .description('Execute a Google Gemini research query (Deep Research)')
    .action(async (query, opts) => {
        // Enforce remote Windmill execution
        console.log(`[CLI] 🚀 Dispatching 'research' to Windmill...`);
        const client = new WindmillClient();
        try {
            const result = await client.executeJob('rsrch/execute', {
                command: 'research',
                args: { query }
            });
            console.log('\n--- Windmill Response ---\n');
            console.log(result?.data || result);
            console.log('\n-----------------------\n');
        } catch (e: any) {
            console.error(`[CLI] Windmill execution failed: ${e.message}`);
            process.exit(1);
        }
    });

gemini
    .command('set-model <model>')
    .description('Set Gemini model')
    .action(async (model, opts, cmdObj) => {
        const options = getOptionsWithGlobals(cmdObj);
        const useServer = !options.local;

        if (useServer) {
            const result = await sendServerRequest('/gemini/set-model', { model });
            if (result.success) {
                console.log(result.message);
            }
        } else {
            await runLocalGeminiAction(async (client, gemini) => {
                await gemini.setModel(model);
            });
        }
    });

gemini
    .command('upload <files...>')
    .description('Upload files to Gemini')
    .action(async (files, opts, cmdObj) => {
        const options = getOptionsWithGlobals(cmdObj);

        console.log(`Uploading ${files.length} files...`);
        const useServer = !options.local;

        if (useServer) {
            const fs = await import('node:fs');
            const path = await import('node:path');

            const payloadFiles = [];
            for (const file of files) {
                const absPath = path.resolve(file);
                if (!fs.existsSync(absPath)) {
                    console.error(`File not found: ${absPath}`);
                    continue;
                }
                const content = fs.readFileSync(absPath, 'utf8');
                payloadFiles.push({
                    content,
                    filename: path.basename(absPath)
                });
            }

            if (payloadFiles.length > 0) {
                const response = await sendServerRequest('/gemini/upload', {
                    files: payloadFiles
                });
                if (response.success) {
                    console.log(`Uploaded ${response.count} files.`);
                    // response.paths has server-side paths
                }
            }
        } else {
            // Local mode
            const path = await import('node:path');
            await runLocalGeminiAction(async (client, gemini) => {
                await gemini.uploadFiles(files.map((f: string) => path.resolve(f)));
            });
        }
        console.log('Upload complete.');
    });

gemini
    .command('chat <message>')
    .description('Chat with Gemini')
    .option('-s, --session <id>', 'Session ID')
    .option('--model <name>', 'Gemini Model (e.g. "Gemini 3 Pro", "Gemini 3 Flash")')
    .option('-f, --file <path...>', 'File(s) to attach')
    .action(async (message, opts, cmdObj) => {
        const options = getOptionsWithGlobals(cmdObj);
        const sessionId = options.session;
        const model = options.model;
        const useServer = !options.local;
        let files = options.file || [];

        if (useServer) {
            // If files attached, upload them first to get server-side paths
            if (files.length > 0) {
                console.log(`[CLI] Uploading ${files.length} attachments...`);
                const fs = await import('node:fs');
                const path = await import('node:path');

                const payloadFiles = [];
                for (const file of files) {
                    const absPath = path.resolve(file);
                    if (fs.existsSync(absPath)) {
                        payloadFiles.push({
                            content: fs.readFileSync(absPath, 'utf8'),
                            filename: path.basename(absPath)
                        });
                    }
                }

                if (payloadFiles.length > 0) {
                    const upRes = await sendServerRequest('/gemini/upload', { files: payloadFiles });
                    if (upRes.success && upRes.paths) {
                        files = upRes.paths; // Use server-side paths
                    }
                }
            }

            await sendServerRequestWithSSE('/gemini/chat', { message, sessionId, stream: true, model, files });
        } else {
            const path = await import('node:path');
            // Resolve local paths if needed, though gemini-client probably resolves them or expects absolute?
            // gemini-client expects absolute usually.
            const absFiles = files.map((f: string) => path.resolve(f));

            await runLocalGeminiAction(async (client, gemini) => {
                if (model) await gemini.setModel(model);
                const response = await gemini.sendMessage(message, {
                    onProgress: (text: string) => process.stdout.write(text),
                    files: absFiles
                });
                console.log('\n');
            }, sessionId);
        }
    });

gemini.command('deep-research <query>')
    .description('Run deep research')
    .option('--gem <name>', 'Gem name')
    .option('--local', 'Use local execution', false)
    .option('--remote', 'Use Windmill remote execution (Default)', true)
    .option('--headed', 'Show browser', false)
    .option('--async', 'Start async (returns job ID immediately)')
    .action(async (query, opts) => {
        // Default to remote if not explicitly local
        if (opts.remote && !opts.local) {
            console.log(`[CLI] 🚀 Dispatching 'deep-research' to Windmill...`);
            const client = new WindmillClient();
            try {
                const result = await client.executeJob('rsrch/execute', {
                    command: 'deep-research',
                    args: { query, gem: opts.gem }
                });
                console.log('\n--- Windmill Response ---\n');
                console.log(result); // Deep research result usually has structured data
                console.log('\n-----------------------\n');
            } catch (e: any) {
                console.error(`[CLI] Windmill execution failed: ${e.message}`);
                process.exit(1);
            }
            return;
        }

        if (opts.async) {
            // Async mode - use server endpoint
            console.log('[Deep Research] Starting async job...');
            const response = await sendServerRequest('/deep-research/start', {
                query,
                gem: opts.gem
            });
            console.log(`\n✓ Job created: ${response.jobId}`);
            console.log(`  Status: ${response.status}`);
            console.log(`\n  Check status: rsrch gemini job-status ${response.jobId}`);
            console.log(`  Get result:   rsrch gemini job-result ${response.jobId}\n`);
            return;
        }

        // Sync mode - run locally
        await runLocalGeminiAction(async (client, gemini) => {
            console.log('\n[Deep Research] Starting...');
            if (opts.gem) console.log(`[Deep Research] Using Gem: ${opts.gem}`);
            console.log('[Deep Research] This may take several minutes.');
            console.log('[Deep Research] The research plan will be automatically confirmed.\n');

            const result = await gemini.startDeepResearch(query, opts.gem);
            console.log('\n--- Deep Research Result ---');
            console.log(`Status: ${result.status} `);
            if (result.googleDocId) {
                console.log(`Google Doc ID: ${result.googleDocId} `);
                console.log(`Google Doc URL: ${result.googleDocUrl} `);
            }
            if (result.error) console.log(`Error: ${result.error} `);
            console.log('----------------------------\n');
        });
    });

gemini.command('job-status <jobId>')
    .description('Get status of an async deep research job')
    .action(async (jobId) => {
        const response = await sendServerRequest(`deep-research/status/${jobId}`, {});
        console.log(`\n--- Job Status ---`);
        console.log(`ID:      ${response.jobId}`);
        console.log(`Status:  ${response.status}`);
        console.log(`Query:   ${response.query}`);
        if (response.createdAt) console.log(`Created: ${new Date(response.createdAt).toISOString()}`);
        if (response.startedAt) console.log(`Started: ${new Date(response.startedAt).toISOString()}`);
        if (response.completedAt) console.log(`Completed: ${new Date(response.completedAt).toISOString()}`);
        if (response.error) console.log(`Error: ${response.error}`);
        console.log('------------------\n');
    });

gemini.command('job-result <jobId>')
    .description('Get result of a completed async deep research job')
    .action(async (jobId) => {
        const response = await sendServerRequest(`deep-research/result/${jobId}`, {});
        if (!response.success) {
            console.log(`\n⏳ Job not completed yet. Status: ${response.status}`);
            return;
        }
        console.log(`\n--- Job Result ---`);
        console.log(`ID: ${response.jobId}`);
        console.log(`Result:`, JSON.stringify(response.result, null, 2));
        console.log('------------------\n');
    });


gemini.command('open-session <identifier>')
    .description('Open a session by ID or Name')
    .option('--local', 'Use local execution', true)
    .action(async (identifier, opts) => {
        await runLocalGeminiAction(async (client, gemini) => {
            const success = await gemini.openSession(identifier);
            if (success) {
                const sessionId = gemini.getCurrentSessionId();
                console.log(`\nSession opened: ${sessionId} `);
                console.log(`URL: https://gemini.google.com/app/${sessionId}\n`);
            } else {
                console.error(`Failed to open session: ${identifier}`);
            }
        });
    });

gemini.command('export-to-docs [sessionId]')
    .description('Export session to Google Docs')
    .option('--local', 'Use local execution', true)
    .action(async (sessionId, opts) => {
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
        }, sessionId);
    });

gemini.command('list-sessions')
    .description('List sessions')
    .argument('[limit]', 'Limit', parseInt, 20)
    .argument('[offset]', 'Offset', parseInt, 0)
    .action(async (limit, offset, opts, cmd) => {
        const globalOpts = getOptionsWithGlobals(cmd);
        const { serverUrl } = cliContext.get();

        if (globalOpts.local) {
            // Dev mode: direct browser
            await runLocalGeminiAction(async (client, gemini) => {
                const sessions = await gemini.listSessions(limit, offset);
                console.log(`\n--- Recent Sessions (Limit: ${limit}, Offset: ${offset}) ---`);
                sessions.forEach((s: { name: string; id: string | null }) => console.log(`- ${s.name} (ID: ${s.id || 'N/A'})`));
                console.log('JSON:', JSON.stringify(sessions));
            });
            return;
        }

        // Production mode: call server API
        try {
            const result = await executeGeminiGet('sessions', { limit, offset }, { server: serverUrl });
            const sessions = result.data || [];
            console.log(`\n--- Recent Sessions (Limit: ${limit}, Offset: ${offset}) ---`);
            sessions.forEach((s: { name: string; id: string | null }) => console.log(`- ${s.name} (ID: ${s.id || 'N/A'})`));
            console.log('JSON:', JSON.stringify(sessions));
        } catch (e: any) {
            console.error(`[CLI] Error: ${e.message}`);
            process.exit(1);
        }
    });

gemini.command('send-message <sessionIdOrMessage> [message]')
    .description('Send message to session')
    .option('--local', 'Use local execution', false)
    .option('--no-wait', 'Do not wait for response')
    .action(async (message, sessionId, opts, cmd) => {
        // Handle optional sessionId
        // If called as 'send-message "Hello"', sessionId is undefined.
        // Commander passes explicit args, then opts, then cmd.
        // No manual shifting needed.

        const globalOpts = getOptionsWithGlobals(cmd);
        const { serverUrl } = cliContext.get();
        // Commander: --no-wait creates 'wait' property initialized to true, set to false when flag is present.
        const waitForResponse = opts.wait;

        if (globalOpts.local) {
            await runLocalGeminiAction(async (client, gemini) => {
                console.log(`Sending message: "${message}"...`);
                // @ts-ignore
                const response = await gemini.sendMessage(message, { waitForResponse });
                if (waitForResponse) {
                    console.log('\n--- Response ---');
                    console.log(response);
                    console.log('----------------\n');
                } else {
                    console.log('Message submitted (not waiting for response).');
                }
            }, sessionId);
            return;
        }

        // Production mode
        try {
            console.log(`[CLI] Sending message to server: "${message}"...`);

            if (waitForResponse) {
                console.log('\n--- Response ---');
                let fullResponse = '';

                let lastLength = 0;
                await executeGeminiStream('chat', { message, sessionId, waitForResponse: true }, { server: serverUrl }, (data: any) => {
                    if (data.type === 'progress' && data.text) {
                        if (globalOpts.verbose) {
                            console.log(`[Chunk] ${JSON.stringify(data.text.substring(Math.max(0, data.text.length - 20)))}`);
                        }
                        const text = data.text;

                        if (text.length >= lastLength && text.startsWith(fullResponse)) {
                            const newContent = text.substring(lastLength);
                            process.stdout.write(newContent);
                            lastLength = text.length;
                            fullResponse = text;
                        } else {
                            // Simple diff printing
                            let commonPrefixLen = 0;
                            const minLen = Math.min(fullResponse.length, text.length);
                            while (commonPrefixLen < minLen && fullResponse[commonPrefixLen] === text[commonPrefixLen]) {
                                commonPrefixLen++;
                            }

                            if (commonPrefixLen === fullResponse.length) {
                                const newContent = text.substring(lastLength);
                                process.stdout.write(newContent);
                            } else {
                                const divergence = text.substring(commonPrefixLen);
                                process.stdout.write('\n[Update] ' + divergence);
                            }

                            lastLength = text.length;
                            fullResponse = text;
                        }
                    } else if (data.type === 'result' && data.response) {
                        if (fullResponse.length === 0) {
                            process.stdout.write(data.response);
                        }
                        fullResponse = data.response;
                    } else if (data.type === 'error') {
                        console.error(`\n[Stream Error] ${data.error}`);
                    }
                });

                if (!fullResponse.endsWith('\n')) console.log('');
                console.log('----------------\n');
            } else {
                const result = await executeGeminiCommand('chat', { message, sessionId, waitForResponse: false }, { server: serverUrl });
                console.log('Message submitted successfully (async).');
                if (globalOpts.verbose) {
                    console.log('[Verbose] Server acknowledged request.');
                    console.log(`[Verbose] Session ID: ${result.data?.sessionId || 'N/A'}`);
                }
            }

        } catch (e: any) {
            console.error(`[CLI] Error: ${e.message}`);
            process.exit(1);
        }
    });

gemini.command('get-response [sessionIdOrIndex] [index]')
    .description('Get response from session')
    .option('--local', 'Use local execution', false)
    .action(async (arg1, arg2, opts, cmd) => {
        let sessionId: string | undefined;
        let idx: number = -1;

        if (arg2) {
            sessionId = arg1;
            idx = parseInt(arg2) || -1;
        } else if (arg1) {
            const parsed = parseInt(arg1);
            if (!isNaN(parsed)) idx = parsed;
            else sessionId = arg1;
        }

        const globalOpts = getOptionsWithGlobals(cmd);
        const { serverUrl } = cliContext.get();

        if (globalOpts.local) {
            await runLocalGeminiAction(async (client, gemini) => {
                const response = await gemini.getResponse(idx);
                console.log(`\n--- Response (index: ${idx}) ---`);
                if (response) console.log(response);
                else console.log('No response found at that index');
                console.log('----------------------------------\n');
            }, sessionId);
            return;
        }

        try {
            const result = await executeGeminiCommand('get-responses', { sessionId }, { server: serverUrl });
            const responses = result.data || [];

            console.log(`\n--- Response (index: ${idx}) ---`);
            if (idx >= 0 && idx < responses.length) {
                console.log(responses[idx]);
            } else if (idx === -1 && responses.length > 0) {
                console.log(responses[responses.length - 1]); // Default to last
            } else {
                console.log('No response found at that index');
            }
            console.log('----------------------------------\n');
        } catch (e: any) {
            console.error(`[CLI] Error: ${e.message}`);
            process.exit(1);
        }
    });

gemini.command('get-responses [sessionId]')
    .description('Get all responses from session')
    .option('--local', 'Use local execution', false)
    .action(async (sessionId, opts, cmd) => {
        const globalOpts = getOptionsWithGlobals(cmd);
        const { serverUrl } = cliContext.get();

        if (globalOpts.local) {
            await runLocalGeminiAction(async (client, gemini) => {
                const responses = await gemini.getResponses();
                console.log('\n--- All Responses ---');
                if (responses.length === 0) console.log('No responses found');
                else {
                    responses.forEach((r: string, i: number) => {
                        console.log(`\n[Response ${i + 1}]`);
                        console.log(r.substring(0, 500) + (r.length > 500 ? '...' : ''));
                    });
                }
                console.log('---------------------\n');
            }, sessionId);
            return;
        }

        try {
            const result = await executeGeminiCommand('get-responses', { sessionId }, { server: serverUrl });
            const responses = result.data || [];
            console.log('\n--- All Responses ---');
            if (responses.length === 0) console.log('No responses found');
            else {
                responses.forEach((r: string, i: number) => {
                    console.log(`\n[Response ${i + 1}]`);
                    console.log(r.substring(0, 500) + (r.length > 500 ? '...' : ''));
                });
            }
            console.log('---------------------\n');
        } catch (e: any) {
            console.error(`[CLI] Error: ${e.message}`);
            process.exit(1);
        }
    });

gemini.command('get-research-info [sessionId]')
    .description('Get research info (title, heading)')
    .option('--local', 'Use local execution', false)
    .action(async (sessionId, opts, cmd) => {
        const globalOpts = getOptionsWithGlobals(cmd);
        const { serverUrl } = cliContext.get();

        if (globalOpts.local) {
            await runLocalGeminiAction(async (client, gemini) => {
                const info = await gemini.getResearchInfo();
                console.log('\n--- Research Info ---');
                console.log(`Session ID: ${info.sessionId || 'N/A'}`);
                console.log(`Title: ${info.title || 'Not found'}`);
                console.log(`First Heading: ${info.firstHeading || 'Not found'}`);
                console.log('---------------------\n');
                console.log('JSON:', JSON.stringify(info, null, 2));
            }, sessionId);
            return;
        }

        try {
            const result = await executeGeminiCommand('get-research-info', { sessionId }, { server: serverUrl });
            const info = result.data || result;
            console.log('\n--- Research Info ---');
            console.log(`Session ID: ${info.sessionId || 'N/A'}`);
            console.log(`Title: ${info.title || 'Not found'}`);
            console.log(`First Heading: ${info.firstHeading || 'Not found'}`);
            console.log('---------------------\n');
            console.log('JSON:', JSON.stringify(info, null, 2));
        } catch (e: any) {
            console.error(`[CLI] Error: ${e.message}`);
            process.exit(1);
        }
    });

gemini.command('list-research-docs [arg]')
    .description('List research docs (by limit or sessionID)')
    .option('--local', 'Use local execution', false)
    .action(async (arg, opts, cmd) => {
        let limit = 10;
        let sessionId: string | undefined;

        if (arg) {
            if (!isNaN(parseInt(arg))) limit = parseInt(arg);
            else sessionId = arg;
        }

        const globalOpts = getOptionsWithGlobals(cmd);
        const { serverUrl } = cliContext.get();

        if (globalOpts.local) {
            await runLocalGeminiAction(async (client, gemini) => {
                let docs: ResearchInfo[] = [];
                if (sessionId) {
                    console.log(`[CLI] Listing research docs for session: ${sessionId}`);
                    await gemini.openSession(sessionId);
                    docs = await gemini.getAllResearchDocsInSession();
                } else {
                    docs = await gemini.listDeepResearchDocuments(limit);
                }

                console.log('\n--- Deep Research Documents ---');
                if (docs.length === 0) console.log('No Deep Research documents found.');
                else {
                    docs.forEach((doc: ResearchInfo, idx: number) => {
                        console.log(`\n[Document ${idx + 1}]`);
                        console.log(`Title: ${doc.title}`);
                        console.log(`First Heading: ${doc.firstHeading}`);
                        console.log(`Session ID: ${doc.sessionId}`);
                    });
                }
                console.log('-------------------------------\n');
                console.log('JSON:', JSON.stringify(docs, null, 2));
            });
            return;
        }

        try {
            const result = await executeGeminiCommand('list-research-docs', { sessionId, limit }, { server: serverUrl });
            const docs = result.data || [];
            console.log('\n--- Deep Research Documents ---');
            if (docs.length === 0) console.log('No Deep Research documents found.');
            else {
                docs.forEach((doc: any, idx: number) => {
                    console.log(`\n[Document ${idx + 1}]`);
                    console.log(`Title: ${doc.title}`);
                    console.log(`First Heading: ${doc.firstHeading}`);
                    console.log(`Session ID: ${doc.sessionId}`);
                });
            }
            console.log('-------------------------------\n');
            console.log('JSON:', JSON.stringify(docs, null, 2));
        } catch (e: any) {
            console.error(`[CLI] Error: ${e.message}`);
            process.exit(1);
        }
    });

/**
 * Enhanced helper to get Gemini client with smart tab reuse.
 */
async function ensureGeminiContext(
    profileId: string | undefined,
    cdpEndpoint: string | undefined,
    reuseStrategy: 'reuse-any' | 'reuse-id' | 'force-new' = 'reuse-any',
    targetId?: string
): Promise<{ client: PerplexityClient, gemini: GeminiClient, cleanup: () => Promise<void> }> {
    const { cliContext } = await import('../cli-context');
    const { PerplexityClient: PClient } = await import('../client');
    const { GeminiClient: GClient } = await import('../gemini-client');
    const { getTab } = await import('@agents/shared/tab-pool');

    const client = new PClient({ profileId: profileId || cliContext.get().profileId, cdpEndpoint });
    await client.init({ local: !cdpEndpoint, profileId, cdpEndpoint });

    let gemini: GeminiClient;

    try {
        if (reuseStrategy === 'reuse-any') {
            // Check for ANY existing Gemini tab in context
            // Access protected context if possible or use public method if available
            // Since we are inside the module, we can access protected members if we were subclass or use 'any' cast
            const context = (client as any).context;
            if (context) {
                const pages = context.pages();
                const existing = pages.find((p: any) => p.url().includes('gemini.google.com'));
                if (existing) {
                    console.log('[CLI] Reusing existing Gemini tab (fast mode)');
                    gemini = new GClient(existing);
                } else {
                    gemini = await client.createGeminiClient();
                }
            } else {
                gemini = await client.createGeminiClient();
            }
        } else if (reuseStrategy === 'reuse-id' && targetId) {
            // Try to find specific ID
            try {
                const browser = (client as any).browser || ((client as any).context?.browser());
                const page = await getTab(browser || (client as any).context, 'gemini', targetId);
                gemini = new GClient(page);
            } catch (e) {
                console.log(`[CLI] Could not find/reuse tab for ${targetId}, creating new...`);
                gemini = await client.createGeminiClient();
            }
        } else {
            // Force new
            gemini = await client.createGeminiClient();
        }
    } catch (e) {
        // Fallback
        console.warn('[CLI] Enhanced context acquisition failed, falling back to standard create:', e);
        gemini = await client.createGeminiClient();
    }

    return {
        client,
        gemini,
        cleanup: async () => {
            // Only close if we created a NEW one?
            // For now, let's just close client which closes browser if local
            // or disconnects if remote.
            // BUT for 'list-updates', we want to keep it valid if we reused it?
            // client.close() handles cleanup properly.
            await client.close();
        }
    };
}

gemini.command('list-updates')
    .description('List sessions that need syncing')
    .option('--local', 'Use local execution', true) // Default strict local for now
    .option('--force-new', 'Force opening a new tab', false)
    .option('--limit <number>', 'Limit items to scan', (v) => parseInt(v), 50)
    .action(async (opts, cmd) => {
        const globalOpts = getOptionsWithGlobals(cmd);
        const { getGraphStore } = await import('../graph-store');
        const { config } = await import('../config');

        // 1. Connect to GraphStore (read-only check mostly)
        const store = getGraphStore();
        await store.connect(config.falkor.host, config.falkor.port);

        try {
            // 2. Connect to Browser (Smart Reuse)
            const reuseStrategy = opts.forceNew ? 'force-new' : 'reuse-any';
            const { client, gemini, cleanup } = await ensureGeminiContext(
                globalOpts.profileId,
                globalOpts.cdpEndpoint,
                reuseStrategy
            );

            try {
                // 3. List Sessions from DOM
                const sessions = await gemini.listSessions(opts.limit);
                console.log(`[CLI] Scanned ${sessions.length} sessions from sidebar.`);

                const updatesNeeded: string[] = [];

                for (const session of sessions) {
                    if (session.pinned) {
                        // console.log(`[CLI] Skipping pinned session: ${session.name}`);
                        continue;
                    }
                    if (!session.id) {
                        // console.warn(`[CLI] Skipping session without ID: ${session.name}`);
                        continue;
                    }

                    // Check DB state
                    const state = await store.getConversationState(session.id, 'gemini');

                    // Logic: If not exists OR (we can detect update time/turn count mismatch?)
                    // Current listSessions doesn't get turn count from sidebar accurately.
                    // But if it exists, we assume it's synced unless we have a specific reason.
                    // WAIT: User said: "updated sessions...". Sidebar sorts by update.
                    // If we find a session that is NOT in DB, we need to sync it.
                    // If it IS in DB, and it's near the top, it MIGHT be updated.
                    // BUT without opening it, we don't know turn count.
                    // LIST-UPDATES strategy:
                    // Return all sessions that are NOT in DB or (optional) lastUpdated is older?
                    // GraphStore.getConversationState returns existence.

                    if (!state.exists) {
                        console.log(`[CLI] New/Missing: ${session.id} (${session.name})`);
                        updatesNeeded.push(session.id);
                    } else {
                        // It exists. Stop condition?
                        // "Iterates until it hits a non-pinned session that is already fully synced"
                        // This implies we trust the order.
                        console.log(`[CLI] Synced: ${session.id} (${session.name}) - Stopping scan.`);
                        break;
                    }
                }

                // Output JSON list for Windmill
                console.log('\n--- Updates Needed ---');
                console.log(JSON.stringify(updatesNeeded));
                console.log('----------------------\n');

            } finally {
                await cleanup();
            }
        } finally {
            await store.disconnect();
        }
    });

gemini.command('scrape-session <id>')
    .description('Scrape and sync a specific session')
    .option('--local', 'Use local execution', true)
    .action(async (id, opts, cmd) => {
        const globalOpts = getOptionsWithGlobals(cmd);
        const { getGraphStore } = await import('../graph-store');
        const { config } = await import('../config');

        const store = getGraphStore();
        await store.connect(config.falkor.host, config.falkor.port);

        try {
            // Reuse if ID matches, else new/search
            const { client, gemini, cleanup } = await ensureGeminiContext(
                globalOpts.profileId,
                globalOpts.cdpEndpoint,
                'reuse-id',
                id
            );

            try {
                console.log(`[CLI] Scraping session ${id}...`);
                // Add method to scrape specific ID in GeminiClient?
                // Or just use openPage/waitFor?
                // gemini.scrapeConversations uses list.
                // We need scrapeSingleSession(id).
                // Let's add it to GeminiClient via `scrapeConversation` which takes index,
                // but better is to navigate directly: https://gemini.google.com/app/ID

                await gemini.goto(`https://gemini.google.com/app/${id}`);
                await gemini.wait(2000);

                const conv = await gemini.extractCurrentConversation();
                if (conv) {
                    // Enrich with ID if missing (it should be in URL)
                    if (!conv.platformId) conv.platformId = id;

                    console.log(`[CLI] Extracted ${conv.turns.length} turns. Syncing...`);
                    const result = await store.syncConversation({
                        platform: 'gemini',
                        platformId: conv.platformId!,
                        title: conv.title,
                        type: conv.type,
                        turns: conv.turns
                    });
                    console.log(`[CLI] Sync Result: ${result.isNew ? 'New' : 'Updated'} (Turns updated: ${result.turnsUpdated})`);
                } else {
                    console.error(`[CLI] Failed to extract conversation ${id}`);
                }

            } finally {
                await cleanup();
            }
        } finally {
            await store.disconnect();
        }
    });

gemini.command('sync-conversations')
    .description('Sync conversations to graph')
    .option('--limit <number>', 'Limit', (v) => parseInt(v), 10)
    .option('--offset <number>', 'Offset', (v) => parseInt(v), 0)
    .option('--async', 'Run in background and return immediately', false)
    .option('--stream', 'Show real-time progress streaming', true)
    .option('--no-stream', 'Disable real-time progress streaming')
    .action(async (opts, cmd) => {
        const globalOpts = getOptionsWithGlobals(cmd);
        const { serverUrl } = cliContext.get();

        if (globalOpts.local) {
            // Dev mode: direct browser + local FalkorDB
            const { getGraphStore } = await import('../graph-store');
            const { config } = await import('../config');
            const store = getGraphStore();
            const graphHost = config.falkor.host;
            await store.connect(graphHost, config.falkor.port);

            try {
                await runLocalGeminiAction(async (client, gemini) => {
                    console.log(`\n[Sync] Scraping Gemini conversations (limit: ${opts.limit}, offset: ${opts.offset})...\n`);
                    const conversations = await gemini.scrapeConversations(opts.limit, opts.offset, (p: any) => {
                        process.stdout.write(`\r[Sync] Progress: ${p.current}/${p.total} - ${p.title.substring(0, 30)}...`);
                    });
                    console.log(`\n[Sync] Found ${conversations.length} conversations`);

                    let synced = 0;
                    let updated = 0;
                    for (const conv of conversations) {
                        const result = await store.syncConversation({
                            platform: 'gemini',
                            platformId: conv.platformId,
                            title: conv.title,
                            type: conv.type,
                            turns: conv.turns
                        });
                        if (result.isNew) synced++;
                        else updated++;
                    }
                    console.log(`\n[Sync] Complete: ${synced} new, ${updated} updated\n`);
                });
            } finally {
                await store.disconnect();
            }
            return;
        }

        try {
            if (opts.async) {
                console.log(`[CLI] Submitting background sync job (limit: ${opts.limit}, offset: ${opts.offset})...`);
                const result = await executeGeminiCommand('sync-conversations', {
                    limit: opts.limit,
                    offset: opts.offset,
                    async: true
                }, { server: serverUrl });

                console.log(`\n--- Sync Job Submitted ---`);
                console.log(`  Job ID: ${result.jobId}`);
                console.log(`  Status: ${result.message}`);
                console.log(`  Check status at: ${result.statusUrl}`);
                console.log(`---------------------------\n`);
                return;
            }

            if (opts.stream !== false) {
                console.log(`[CLI] Starting sync with real-time updates...`);
                const result = await executeGeminiStream('sync-conversations', {
                    limit: opts.limit,
                    offset: opts.offset
                }, { server: serverUrl }, (event: any) => {
                    if (event.type === 'progress') {
                        process.stdout.write(`\r[Sync] ${event.status}: ${event.current}/${event.total} - ${event.title.substring(0, 30)}...`);
                    } else if (event.type === 'error') {
                        console.error(`\n[CLI] Server error: ${event.error}`);
                    }
                });

                const data = result.data || result;
                console.log(`\n\n--- Sync Complete ---`);
                console.log(`  Synced: ${data.synced || 0} new`);
                console.log(`  Updated: ${data.updated || 0}`);
                console.log(`  Total: ${data.total || 0}`);
                console.log(`--------------------\n`);
            } else {
                console.log(`[CLI] Calling server to sync conversations (blocking)...`);
                const result = await executeGeminiCommand('sync-conversations', {
                    limit: opts.limit,
                    offset: opts.offset
                }, { server: serverUrl });

                const data = result.data || result;
                console.log(`\n--- Sync Complete ---`);
                console.log(`  Synced: ${data.synced || 0} new`);
                console.log(`  Updated: ${data.updated || 0}`);
                console.log(`  Total: ${data.total || 0}`);
                console.log(`--------------------\n`);
            }
        } catch (e: any) {
            console.error(`\n[CLI] Error: ${e.message}`);
            process.exit(1);
        }
    });

gemini.command('upload-file <path> [sessionId]')
    .description('Upload a file')
    .option('--local', 'Use local execution', true)
    .action(async (filePath, sessionId, opts) => {
        await runLocalGeminiAction(async (client, gemini) => {
            const success = await gemini.uploadFile(filePath);
            if (success) console.log(`\n✅ File uploaded: ${filePath}`);
            else console.log(`\n❌ File upload failed: ${filePath}`);
            const currentId = gemini.getCurrentSessionId();
            if (currentId) console.log(`Session: ${currentId}`);
        }, sessionId);
    });

gemini.command('upload-files <files...>')
    .description('Upload multiple files')
    .option('--local', 'Use local execution', true)
    .action(async (args, opts) => {
        let sessionId: string | undefined;
        let filePaths = args;

        if (filePaths.length > 0 && !filePaths[0].includes('/') && !filePaths[0].includes('.') && !fs.existsSync(filePaths[0])) {
            sessionId = filePaths[0];
            filePaths = filePaths.slice(1);
        }

        if (filePaths.length === 0) {
            console.error('No files provided.');
            process.exit(1);
        }

        await runLocalGeminiAction(async (client, gemini) => {
            const count = await gemini.uploadFiles(filePaths);
            console.log(`\n✅ Uploaded ${count}/${filePaths.length} files`);
            const currentId = gemini.getCurrentSessionId();
            if (currentId) console.log(`Session: ${currentId}`);
        }, sessionId);
    });

gemini.command('upload-repo <repoUrl> [sessionId]')
    .description('Upload repository context')
    .option('--branch <branch>', 'Git branch')
    .option('--local', 'Use local execution', true)
    .action(async (repoUrl, sessionId, opts) => {
        await runLocalGeminiAction(async (client, gemini) => {
            const { RepoLoader } = await import('../repo-loader');
            const loader = new RepoLoader();
            try {
                console.log(`\n[Repo] Processing repository: ${repoUrl}`);
                const contextFile = await loader.loadRepoAsFile(repoUrl, { branch: opts.branch });
                console.log(`\n[Repo] Context file created at: ${contextFile}`);
                console.log(`[Repo] Uploading to Gemini...`);
                const success = await gemini.uploadFile(contextFile);
                if (success) console.log(`\n✅ Repository context uploaded successfully!`);
                else console.log(`\n❌ Failed to upload repository context.`);
            } catch (e: any) {
                console.error(`\n❌ Error processing repository: ${e.message}`);
            } finally {
                console.log(`[Repo] Temporary files kept in temp dir for reference.`);
            }
        }, sessionId);
    });

gemini.command('sources')
    .description('List available context sources')
    .action(async () => {
        const response = await sendServerRequest('/gemini/sources');
        if (response.success && response.sources) {
            console.log('Available Context Sources:');
            response.sources.forEach((s: string) => console.log(` - ${s}`));
        } else {
            console.log('No sources found or failed to retrieve sources.');
        }
    });

gemini.command('list-gems')
    .description('List available Gems')
    .option('--local', 'Use local execution', false)
    .action(async (opts, cmd) => {
        const globalOpts = getOptionsWithGlobals(cmd);
        const { serverUrl } = cliContext.get();

        if (globalOpts.local) {
            await runLocalGeminiAction(async (client, gemini) => {
                const gems = await gemini.listGems();
                console.log('\n--- Available Gems ---');
                gems.forEach((gem: any) => console.log(`- ${gem.name} (ID: ${gem.id})`));
                console.log('----------------------\n');
            });
            return;
        }

        try {
            const result = await executeGeminiGet('gems', {}, { server: serverUrl });
            const gems = result.data || [];
            console.log('\n--- Available Gems ---');
            gems.forEach((gem: any) => console.log(`- ${gem.name} (ID: ${gem.id})`));
            console.log('----------------------\n');
        } catch (e: any) {
            console.error(`[CLI] Error: ${e.message}`);
            process.exit(1);
        }
    });

gemini.command('open-gem <gemNameOrId>')
    .description('Open a Gem')
    .option('--local', 'Use local execution', true)
    .action(async (gemNameOrId, opts, cmd) => {
        const globalOpts = getOptionsWithGlobals(cmd);
        const { serverUrl } = cliContext.get();

        if (globalOpts.local) {
            await runLocalGeminiAction(async (client, gemini) => {
                const success = await gemini.openGem(gemNameOrId);
                if (success) console.log(`\n✅ Opened gem: ${gemNameOrId}`);
                else console.log(`\n❌ Failed to open gem: ${gemNameOrId}`);
            });
            return;
        }

        try {
            await executeGeminiCommand('open-gem', { gemNameOrId }, { server: serverUrl });
            console.log(`\n✅ Opened gem: ${gemNameOrId} (on server)`);
        } catch (e: any) {
            console.error(`[CLI] Error: ${e.message}`);
            process.exit(1);
        }
    });

gemini.command('create-gem <name>')
    .description('Create a new Gem')
    .requiredOption('--instructions <text>', 'System instructions')
    .option('--file <paths...>', 'Files to upload')
    .option('--config <path>', 'Config file')
    .option('--local', 'Use local execution', true)
    .action(async (name, opts) => {
        let gemName = name;
        let instructions = opts.instructions;
        let files = opts.file || [];

        if (opts.config) {
            try {
                const { loadGemConfig } = require('../gem-config');
                const config = loadGemConfig(opts.config);
                if (!gemName || gemName === 'default') gemName = config.name;
                if (!instructions) instructions = config.instructions;
                if (config.files) files.push(...config.files);
                console.log(`[Gemini] Loaded config from ${opts.config}`);
            } catch (e: any) {
                console.error(`Error loading config: ${e.message}`);
                process.exit(1);
            }
        }

        await runLocalGeminiAction(async (client, gemini) => {
            const gemId = await gemini.createGem({
                name: gemName,
                instructions,
                files: files.length > 0 ? files : undefined,
            });
            if (gemId) console.log(`\n✅ Created gem: ${gemName} (ID: ${gemId})`);
            else console.log(`\n⚠️ Gem created but ID unknown: ${gemName}`);
        });
    });

gemini.command('chat-gem <gemNameOrId> <message>')
    .description('Chat with a Gem')
    .option('--local', 'Use local execution', true)
    .action(async (gemNameOrId, message, opts, cmd) => {
        const globalOpts = getOptionsWithGlobals(cmd);
        const { serverUrl } = cliContext.get();

        if (globalOpts.local) {
            await runLocalGeminiAction(async (client, gemini) => {
                const response = await gemini.chatWithGem(gemNameOrId, message);
                console.log('\n--- Response ---');
                if (response) console.log(response);
                else console.log('No response received');
                console.log('----------------\n');
            });
            return;
        }

        try {
            const result = await executeGeminiCommand('chat-gem', { gemNameOrId, message }, { server: serverUrl });
            console.log('\n--- Response ---');
            console.log(result.data?.response || result.response || 'No response data');
            console.log('----------------\n');
        } catch (e: any) {
            console.error(`[CLI] Error: ${e.message}`);
            process.exit(1);
        }
    });

export const geminiCommand = gemini;
