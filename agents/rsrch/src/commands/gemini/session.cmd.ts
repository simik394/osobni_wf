import { Command } from 'commander';
import { 
    executeGeminiCommand, 
    sendServerRequest 
} from '../../cli/utils';
import { cliContext } from '../../cli/context';

export function registerSessionCommands(gemini: Command) {
    gemini.command('open-session <identifier>')
        .description('Open a session by ID or Name')
        .action(async (identifier) => {
            const data = await sendServerRequest('/gemini/session/open', { identifier }, 'POST');
            if (data?.success) {
                console.log(`\nSession opened: ${data.sessionId}`);
                console.log(`URL: https://gemini.google.com/app/${data.sessionId}\n`);
            }
        });

    gemini.command('list-sessions')
        .description('List sessions with efficient search and filtering')
        .option('-l, --limit <number>', 'Limit number of sessions', '20')
        .option('-o, --offset <number>', 'Offset for pagination', '0')
        .option('-q, --query <string>', 'Search query')
        .option('-p, --pinned', 'Show only pinned sessions')
        .option('-s, --strategy <strategy>', 'Discovery strategy: search, scroll, hybrid', 'hybrid')
        .action(async (opts) => {
            const { serverUrl } = cliContext.get();
            try {
                const result = await executeGeminiCommand('list-sessions', {
                    limit: parseInt(opts.limit),
                    offset: parseInt(opts.offset),
                    query: opts.query,
                    pinnedOnly: opts.pinned,
                    strategy: opts.strategy
                }, { server: serverUrl });
                const sessions = result.data || [];
                
                console.log(`\n--- Gemini Sessions (Query: ${opts.query || 'none'}, Pinned: ${opts.pinned || 'any'}) ---`);
                if (sessions.length === 0) {
                    console.log('No sessions found.');
                } else {
                    sessions.forEach((s: any) => {
                        const pinnedMark = s.pinned ? '📌' : '  ';
                        const title = s.name.length > 40 ? s.name.substring(0, 37) + '...' : s.name.padEnd(40);
                        console.log(`${pinnedMark} ${title} (ID: ${s.id})`);
                    });
                }
                console.log('----------------------------------------------------------\n');
            } catch (e: any) {
                console.error(`[CLI] Error: ${e.message}`);
            }
        });

    gemini.command('load-history')
        .description('Targeted history loading (efficient infinite scroll)')
        .option('-l, --limit <number>', 'Stop after loading N messages', (val) => parseInt(val))
        .option('-u, --until <text>', 'Stop scrolling when this text is found')
        .action(async (opts) => {
            const data = await sendServerRequest('/gemini/session/load-history', { limit: opts.limit, untilText: opts.until }, 'POST');
            if (data?.success) console.log('History loading task completed.');
        });

    gemini.command('get-response [sessionIdOrIndex] [index]')
        .description('Get response from session')
        .action(async (arg1, arg2, cmd) => {
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

            const { serverUrl } = cliContext.get();

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
        .action(async (sessionId, cmd) => {
            const { serverUrl } = cliContext.get();

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
        .action(async (sessionId, cmd) => {
            const { serverUrl } = cliContext.get();

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
        .action(async (arg, cmd) => {
            let limit = 10;
            let sessionId: string | undefined;

            if (arg) {
                if (!isNaN(parseInt(arg))) limit = parseInt(arg);
                else sessionId = arg;
            }

            const { serverUrl } = cliContext.get();

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
        .action(async () => {
            const data = await sendServerRequest('/gemini/environment/model-status', {}, 'GET');
            if (data?.success) {
                console.log('\n--- Gemini Model Status ---');
                data.data.forEach((s: any) => {
                    const limitTag = s.isLimited ? ' [LIMITED]' : ' [READY]';
                    console.log(`${s.name.padEnd(20)} ${limitTag} ${s.resetTime ? `(Reset: ${s.resetTime})` : ''}`);
                    if (s.info) console.log(`   Info: ${s.info}`);
                });
                console.log('---------------------------\n');
            }
        });

    gemini.command('share-session [sessionId]')
        .description('Generate a shareable public link for a session')
        .action(async (sessionId) => {
            // shareSession endpoint uses active session but passing ID doesn't switch yet on server? 
            // We'll just call the server endpoint
            const data = await sendServerRequest('/gemini/session/share', { sessionId }, 'POST');
            if (data?.success && data.link) {
                console.log(`\nPublic share link: ${data.link}\n`);
            } else {
                console.error('Failed to generate share link.');
            }
        });

    gemini.command('pin [sessionId]')
        .description('Pin a session in the sidebar')
        .action(async (sessionId) => {
            const { serverUrl } = cliContext.get();
            const result = await executeGeminiCommand('pin', { sessionId }, { server: serverUrl });
            if (result?.success) console.log(`Session ${sessionId || 'current'} pinned.`);
        });

    gemini.command('unpin [sessionId]')
        .description('Unpin a session in the sidebar')
        .action(async (sessionId) => {
            const { serverUrl } = cliContext.get();
            const result = await executeGeminiCommand('unpin', { sessionId }, { server: serverUrl });
            if (result?.success) console.log(`Session ${sessionId || 'current'} unpinned.`);
        });

    gemini.command('rename <newName> [sessionId]')
        .description('Rename a session')
        .action(async (newName, sessionId) => {
            const { serverUrl } = cliContext.get();
            const result = await executeGeminiCommand('rename', { newName, sessionId }, { server: serverUrl });
            if (result?.success) console.log(`Session renamed to "${newName}".`);
        });

    gemini.command('delete [sessionId]')
        .description('Delete a session')
        .action(async (sessionId) => {
            const { serverUrl } = cliContext.get();
            const result = await executeGeminiCommand('delete', { sessionId }, { server: serverUrl });
            if (result?.success) console.log(`Session deleted.`);
        });

    gemini.command('export [sessionId]')
        .description('Export the full session history to Markdown')
        .option('-o, --output <path>', 'Output file path')
        .action(async (sessionId, opts) => {
            const data = await sendServerRequest('/gemini/session/export', { sessionId }, 'POST');
            if (data?.success && data.data) {
                const sessionData = data.data;
                const fs = await import('node:fs');
                const path = await import('node:path');
                
                const targetPath = opts.output || path.join(process.cwd(), `gemini_session_${sessionData.title.replace(/[^a-z0-9]/gi, '_')}.md`);
                fs.writeFileSync(targetPath, sessionData.markdown, 'utf-8');
                
                console.log(`\n--- Session Exported ---`);
                console.log(`Title: ${sessionData.title}`);
                console.log(`Turns: ${sessionData.turns.length}`);
                console.log(`Saved to: ${targetPath}`);
                console.log(`------------------------\n`);
            }
        });

    gemini.command('draft-gmail [sessionId]')
        .description('Export latest Gemini response as a Gmail draft')
        .action(async (sessionId) => {
            if (sessionId) await sendServerRequest('/gemini/session/open', { identifier: sessionId }, 'POST');
            
            console.log('\nCreating Gmail draft from the latest response...');
            const data = await sendServerRequest('/gemini/draft-to-gmail', {}, 'POST');
            if (data?.success) {
                console.log('\n✅ Gmail draft created successfully!');
                if (data.draftUrl) {
                    console.log(`Draft URL: ${data.draftUrl}`);
                }
            } else {
                console.log('\n❌ Failed to draft in Gmail');
            }
            console.log('');
        });

    gemini.command('list-shared')
        .description('List all active public shared links')
        .action(async () => {
            console.log('\nListing active public shared links...');
            const res = await sendServerRequest('/gemini/sharing/links', {}, 'GET');
            if (res?.success && res.links) {
                console.log('\n--- Active Public Links ---');
                if (res.links.length === 0) {
                    console.log('No public links found.');
                } else {
                    res.links.forEach((link: any, index: number) => {
                        console.log(`${index + 1}. Title: ${link.title}`);
                        console.log(`   URL: ${link.url}`);
                        console.log(`   ID:  ${link.id}`);
                        console.log('---------------------------');
                    });
                }
                console.log('');
            } else {
                console.log('\n❌ Failed to retrieve public shared links.');
            }
        });

    gemini.command('delete-shared <idOrTitle>')
        .description('Delete a specific public shared link by ID or Session Title')
        .action(async (idOrTitle) => {
            console.log(`\nDeleting public shared link: "${idOrTitle}"...`);
            const res = await sendServerRequest('/gemini/sharing/delete', { linkIdOrTitle: idOrTitle }, 'POST');
            if (res?.success) {
                console.log(`\n✅ Successfully deleted public shared link.`);
            } else {
                console.log(`\n❌ Failed to delete public shared link.`);
            }
        });

    gemini.command('delete-all-shared')
        .description('Delete ALL public shared links in this Gemini account')
        .action(async () => {
            console.log('\nDeleting all public shared links...');
            const res = await sendServerRequest('/gemini/sharing/delete-all', {}, 'POST');
            if (res?.success) {
                console.log(`\n✅ Successfully deleted all public shared links.`);
            } else {
                console.log(`\n❌ Failed to delete public shared links.`);
            }
        });
}
