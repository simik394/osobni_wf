import { Command } from 'commander';
import { 
    runLocalGeminiAction, 
    executeGeminiGet, 
    executeGeminiCommand, 
    getOptionsWithGlobals 
} from '../../cli/utils';
import { cliContext } from '../../cli/context';

export function registerSessionCommands(gemini: Command) {
    gemini.command('open-session <identifier>')
        .description('Open a session by ID or Name')
        .option('--local', 'Use local execution', true)
        .action(async (identifier) => {
            await runLocalGeminiAction(async (client, gemini) => {
                const success = await gemini.openSession(identifier);
                if (success) {
                    const sessionId = await gemini.getCurrentSessionId();
                    console.log(`\nSession opened: ${sessionId}`);
                    console.log(`URL: https://gemini.google.com/app/${sessionId}\n`);
                }
            });
        });

    gemini.command('list-sessions')
        .description('List sessions with efficient search and filtering')
        .option('-l, --limit <number>', 'Limit number of sessions', '20')
        .option('-o, --offset <number>', 'Offset for pagination', '0')
        .option('-q, --query <string>', 'Search query')
        .option('-p, --pinned', 'Show only pinned sessions')
        .option('-s, --strategy <strategy>', 'Discovery strategy: search, scroll, hybrid', 'hybrid')
        .option('--local', 'Use local execution', true)
        .action(async (opts) => {
            await runLocalGeminiAction(async (client, gemini) => {
                const sessions = await gemini.listSessions({
                    limit: parseInt(opts.limit),
                    offset: parseInt(opts.offset),
                    query: opts.query,
                    pinnedOnly: opts.pinned,
                    strategy: opts.strategy
                });
                
                console.log(`\n--- Gemini Sessions (Query: ${opts.query || 'none'}, Pinned: ${opts.pinned || 'any'}) ---`);
                if (sessions.length === 0) {
                    console.log('No sessions found.');
                } else {
                    sessions.forEach(s => {
                        const pinnedMark = s.pinned ? '📌' : '  ';
                        const title = s.name.length > 40 ? s.name.substring(0, 37) + '...' : s.name.padEnd(40);
                        console.log(`${pinnedMark} ${title} (ID: ${s.id})`);
                    });
                }
                console.log('----------------------------------------------------------\n');
            });
        });

    gemini.command('load-history')
        .description('Targeted history loading (efficient infinite scroll)')
        .option('-l, --limit <number>', 'Stop after loading N messages', (val) => parseInt(val))
        .option('-u, --until <text>', 'Stop scrolling when this text is found')
        .option('--local', 'Use local execution', true)
        .action(async (opts, cmd) => {
            await runLocalGeminiAction(async (client, gemini) => {
                await gemini.scrollToTop({ 
                    limit: opts.limit, 
                    untilText: opts.until 
                });
                console.log('History loading task completed.');
            });
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
                    console.log(responses[responses.length - 1]);
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
                    let docs = [];
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
                        docs.forEach((doc: any, idx: number) => {
                            console.log(`\n[Document ${idx + 1}]`);
                            console.log(`Title: ${doc.title}`);
                            console.log(`First Heading: ${doc.firstHeading}`);
                            console.log(`Session ID: ${doc.sessionId}`);
                        });
                    }
                    console.log('----------------------------------\n');
                });
                return;
            }

            try {
                const result = await executeGeminiCommand('list-research-docs', { limit, sessionId }, { server: serverUrl });
                const docs = result.data || [];
                console.log('\n--- Deep Research Documents ---');
                docs.forEach((doc: any, idx: number) => {
                    console.log(`\n[Document ${idx + 1}]`);
                    console.log(`Title: ${doc.title}`);
                    console.log(`Session ID: ${doc.sessionId}`);
                });
                console.log('----------------------------------\n');
            } catch (e: any) {
                console.error(`[CLI] Error: ${e.message}`);
                process.exit(1);
            }
        });

    gemini.command('model-status')
        .description('Check Gemini model availability and rate limits')
        .option('--local', 'Use local execution', true)
        .action(async (opts, cmd) => {
            await runLocalGeminiAction(async (client, gemini) => {
                const statuses = await gemini.getModelStatus();
                console.log('\n--- Gemini Model Status ---');
                statuses.forEach(s => {
                    const limitTag = s.isLimited ? ' [LIMITED]' : ' [READY]';
                    console.log(`${s.name.padEnd(20)} ${limitTag} ${s.resetTime ? `(Reset: ${s.resetTime})` : ''}`);
                    if (s.info) console.log(`   Info: ${s.info}`);
                });
                console.log('---------------------------\n');
            });
        gemini.command('share-session [sessionId]')
        .description('Generate a shareable public link for a session')
        .option('--local', 'Use local execution', true)
        .action(async (sessionId) => {
            await runLocalGeminiAction(async (client, gemini) => {
                const link = await gemini.shareSession();
                if (link) {
                    console.log(`\nPublic share link: ${link}\n`);
                } else {
                    console.error('Failed to generate share link.');
                }
            }, sessionId);
        });

    gemini.command('pin [sessionId]')
        .description('Pin a session in the sidebar')
        .option('--local', 'Use local execution', true)
        .action(async (sessionId) => {
            await runLocalGeminiAction(async (client, gemini) => {
                const success = await gemini.pinSession(sessionId);
                if (success) console.log(`Session ${sessionId || 'current'} pinned.`);
            }, sessionId);
        });

    gemini.command('unpin [sessionId]')
        .description('Unpin a session in the sidebar')
        .option('--local', 'Use local execution', true)
        .action(async (sessionId) => {
            await runLocalGeminiAction(async (client, gemini) => {
                const success = await gemini.unpinSession(sessionId);
                if (success) console.log(`Session ${sessionId || 'current'} unpinned.`);
            }, sessionId);
        });
}
