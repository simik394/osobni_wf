#!/usr/bin/env node
import { login } from './auth';
import { PerplexityClient } from './client';
import { startServer } from './server';
import * as fs from 'fs';
import { config } from './config';
import * as path from 'path';
import { GeminiClient, ResearchInfo } from './gemini-client';
import { listProfiles, getProfileInfo, deleteProfile } from './profile';

const args = process.argv.slice(2);
const command = args[0];

// Global flags parsing
function getGlobalFlag(flag: string): string | undefined {
    for (let i = 0; i < args.length; i++) {
        if (args[i] === flag && args[i + 1]) {
            return args[i + 1];
        }
        if (args[i].startsWith(`${flag}=`)) {
            return args[i].split('=')[1];
        }
    }
    return undefined;
}

const globalProfileId = getGlobalFlag('--profile') || 'default';
const globalCdpEndpoint = getGlobalFlag('--cdp');

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
        } else if (arg === '--deep') {
            options.deepResearch = true;
        } else if (arg === '--local' || arg === '--headed') {
            // Ignore environment flags
        } else if (arg === '--keep-alive') {
            options.keepAlive = true;
        } else {
            // Check for --name or other flags if mixed
            if (arg.startsWith('--name=')) {
                options.name = arg.split('=')[1];
            } else {
                queryParts.push(arg);
            }
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
        const { getStateDir } = await import('./profile');
        const userDataDir = getStateDir(globalProfileId || 'default');
        await login(userDataDir);
    } else if (command === 'login') {
        const client = new PerplexityClient({ profileId: globalProfileId, cdpEndpoint: globalCdpEndpoint });
        await client.init({ profileId: globalProfileId, cdpEndpoint: globalCdpEndpoint });

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

    } else if (command === 'profile') {
        // Profile management commands
        const subCmd = args[1];

        if (subCmd === 'list') {
            const profiles = listProfiles();
            if (profiles.length === 0) {
                console.log('No profiles found.');
            } else {
                console.log('Available profiles:');
                for (const p of profiles) {
                    const authStatus = p.hasAuth ? '✓ authenticated' : '✗ no auth';
                    const indicator = p.id === globalProfileId ? ' (CLI default)' : '';
                    console.log(`  ${p.id}${indicator}: ${authStatus}`);
                }
            }
        } else if (subCmd === 'info') {
            const profileId = args[2] || globalProfileId;
            const info = getProfileInfo(profileId);
            console.log(`Profile: ${info.id}`);
            console.log(`  Auth file: ${info.authFile}`);
            console.log(`  State dir: ${info.stateDir}`);
            console.log(`  Exists: ${info.exists}`);
            console.log(`  Has auth: ${info.hasAuth}`);
        } else if (subCmd === 'delete') {
            const profileId = args[2];
            if (!profileId) {
                console.error('Usage: rsrch profile delete <profileId>');
                process.exit(1);
            }
            if (deleteProfile(profileId)) {
                console.log(`Profile '${profileId}' deleted.`);
            }
        } else {
            console.log('Profile commands:');
            console.log('  rsrch profile list                    # List all profiles');
            console.log('  rsrch profile info [profileId]        # Show profile details');
            console.log('  rsrch profile delete <profileId>      # Delete a profile');
            console.log('');
            console.log('Usage with --profile flag:');
            console.log('  rsrch --profile work auth             # Auth with "work" profile');
            console.log('  rsrch --profile work gemini list-research-docs --local');
            console.log('');
            console.log('Usage with --cdp flag (container mode):');
            console.log('  rsrch --cdp http://localhost:9224 --profile work ...');
        }

    } else if (command === 'notebook') {
        // notebook audio [--notebook "Title"] [--sources "a,b"] [--prompt "..."]

        const isLocalExecution = (argv?: any) => args.includes('--local');

        const runLocalNotebookAction = async (argv: any, action: (client: PerplexityClient, notebook: any) => Promise<void>) => {
            console.log(`Running in LOCAL mode (profile: ${globalProfileId})...`);
            const client = new PerplexityClient({ profileId: globalProfileId, cdpEndpoint: globalCdpEndpoint });
            await client.init({ profileId: globalProfileId, cdpEndpoint: globalCdpEndpoint });
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

        } else if (subArg1 === 'generate-audio' || subArg1 === 'audio') {
            let notebookTitle = undefined;
            let sources: string[] = [];
            let customPrompt: string | undefined = undefined;
            let wetRun = false;

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
                } else if (args[i] === '--wet') {
                    wetRun = true;
                }
            }

            const dryRun = !wetRun; // Default to dryRun unless --wet is passed

            if (dryRun) {
                console.log('\n🧪 DRY RUN MODE ACTIVE');
                console.log('   Audio generation will be simulated correctly, but the final "Generate" click will be SKIPPED.');
                console.log('   To actually generate audio (and consume quota), use the --wet flag.\n');
            } else {
                console.log('\n🌊 WET RUN ACTIVE');
                console.log('   Audio WILL be generated. Quota will be consumed.\n');
            }

            if (isLocalExecution()) {
                // Import graph store for syncing
                const { getGraphStore } = await import('./graph-store');
                const store = getGraphStore();
                const graphHost = process.env.FALKORDB_HOST || 'localhost';

                await runLocalNotebookAction({}, async (client, notebook) => {
                    // 1. Generate Audio
                    const result = await notebook.generateAudioOverview(notebookTitle, sources, customPrompt, false, dryRun);

                    if (dryRun) return;

                    if (result.success && result.artifactTitle) {
                        console.log(`\n[Audio] Generation successful. New artifact: "${result.artifactTitle}"`);

                        // 2. Scrape & Sync to persist new audio node
                        // We need the platformId (notebook ID) to link
                        // If notebookTitle was passed, we might need to find the ID. 
                        // Scrape returns platformId.
                        try {
                            if (notebookTitle) {
                                await store.connect(graphHost, parseInt(process.env.FALKORDB_PORT || '6379'));
                                console.log('[Audio] Syncing notebook state to graph...');
                                const data = await notebook.scrapeNotebook(notebookTitle, false);
                                const syncResult = await store.syncNotebook(data);

                                // 3. Link Sources
                                if (sources.length > 0) {
                                    console.log('[Audio] Linking audio to sources in graph...');
                                    await store.linkAudioToSources(syncResult.id.replace('nb_', ''), result.artifactTitle, sources);
                                    console.log('[Audio] Lineage recorded.');
                                }
                            } else {
                                console.warn('[Audio] No notebook title provided, skipping graph sync/link. (Cannot reliably determine notebook context without title)');
                            }
                        } catch (e: any) {
                            console.error('[Audio] Failed to sync graph:', e.message);
                        } finally {
                            await store.disconnect();
                        }

                    } else if (result.success) {
                        console.log('\n[Audio] Generation successful (or existing), but no new unique artifact identified (or no wait).');
                        // We could still sync here just in case
                    } else {
                        console.error('\n[Audio] Generation failed.');
                        process.exit(1);
                    }
                });
            } else {
                await sendServerRequest('/notebook/generate-audio', { notebookTitle, sources, customPrompt, dryRun });
            }
        } else if (subArg1 === 'download-audio') {
            // formula: notebook download-audio [output_path] --notebook <Title> [--local] [--latest] [--pattern "regex"]

            let notebookTitle: string | undefined = undefined;
            let outputPath: string = 'audio_overview.mp3'; // Default output path
            let latestOnly = false;
            let audioTitlePattern: string | undefined = undefined;

            // subArg2 is the optional output path (if not a flag)
            if (subArg2 && !subArg2.startsWith('--')) {
                outputPath = subArg2;
            }

            for (let i = 2; i < args.length; i++) {
                if (args[i] === '--notebook') {
                    notebookTitle = args[i + 1];
                    i++;
                } else if (args[i] === '--local') {
                    // Consume --local flag
                } else if (args[i] === '--latest') {
                    latestOnly = true;
                } else if (args[i] === '--pattern') {
                    audioTitlePattern = args[i + 1];
                    i++;
                } else if (i === 2 && !args[i].startsWith('--')) {
                    // Already handled subArg2 as output path
                } else if (args[i].startsWith('--')) {
                    // Unknown flag or already handled
                }
            }

            if (!notebookTitle) {
                console.error('Usage: rsrch notebook download-audio [output_path] --notebook "Title" [--local] [--latest] [--pattern "Regex"]');
                process.exit(1);
            }

            if (isLocalExecution()) {
                await runLocalNotebookAction({}, async (client, notebook) => {
                    const resolvedOutputPath = path.resolve(process.cwd(), outputPath);
                    console.log(`[CLI] Downloading audio... Output: ${resolvedOutputPath}`);
                    if (latestOnly) console.log(`[CLI] Mode: Latest audio only.`);
                    if (audioTitlePattern) console.log(`[CLI] Mode: Filtering by pattern "${audioTitlePattern}".`);

                    await notebook.downloadAudio(notebookTitle as string, resolvedOutputPath, {
                        latestOnly,
                        audioTitlePattern
                    });
                });
            } else {
                console.log('Server implementation for download-audio not yet available. Use --local.');
            }

        } else if (subArg1 === 'download-all-audio') {
            // formula: notebook download-all-audio [output_dir] --notebook <Title> [--local] [--limit N]
            let notebookTitle: string | undefined = undefined;
            let outputDir: string = './audio_downloads'; // Default output directory
            let limit: number | undefined = undefined;

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
                } else if (args[i].startsWith('--limit=')) {
                    limit = parseInt(args[i].split('=')[1]);
                } else if (i === 2 && !args[i].startsWith('--')) {
                    // Already handled subArg2 as output directory
                } else if (args[i].startsWith('--')) {
                    // Unknown flag or already handled
                }
            }

            if (!notebookTitle) {
                console.error('Usage: rsrch notebook download-all-audio [output_dir] --notebook "Title" [--local] [--limit=N]');
                process.exit(1);
            }

            if (isLocalExecution()) {
                await runLocalNotebookAction({}, async (client, notebook) => {
                    const resolvedOutputDir = path.resolve(process.cwd(), outputDir);
                    console.log(`[CLI] Downloading ${limit ? 'top ' + limit : 'ALL'} audio... Output: ${resolvedOutputDir}`);

                    await notebook.downloadAllAudio(notebookTitle as string, resolvedOutputDir, { limit });
                });
            } else {
                console.log('Server mode for download-all-audio not yet implemented. Use --local.');
            }

        } else if (subArg1 === 'sync') {
            // rsrch notebook sync [--title "Title"] [-a] [--local]
            let title: string | undefined = undefined;
            let downloadAudio = false;

            for (let i = 2; i < args.length; i++) {
                if (args[i] === '--title') {
                    title = args[i + 1];
                    i++;
                } else if (args[i] === '-a' || args[i] === '--audio') {
                    downloadAudio = true;
                }
            }

            if (isLocalExecution()) {
                const { getGraphStore } = await import('./graph-store');
                const store = getGraphStore();
                const graphHost = process.env.FALKORDB_HOST || 'localhost';
                await store.connect(graphHost, parseInt(process.env.FALKORDB_PORT || '6379'));

                try {
                    await runLocalNotebookAction({}, async (client, notebook) => {
                        if (title) {
                            // Sync single notebook
                            console.log(`\n[Sync] Scraping notebook: "${title}"...`);
                            if (downloadAudio) console.log('[Sync] Audio download enabled (-a)');

                            const data = await notebook.scrapeNotebook(title, downloadAudio);
                            const result = await store.syncNotebook(data);
                            console.log(`\n[Sync] Result: ${result.isNew ? 'New' : 'Updated'} notebook ${result.id}\n`);
                        } else {
                            // Sync all notebooks (listing only currently, full scrape needs iteration)
                            console.log('\n[Sync] Listing all notebooks...');
                            const notebooks = await notebook.listNotebooks();

                            console.log(`\n[Sync] Found ${notebooks.length} notebooks. Syncing metadata...`);

                            for (const nb of notebooks) {
                                // For listing, we don't open each one so we don't have sources/audio yet
                                // We'll store a basic record
                                const result = await store.syncNotebook({
                                    platformId: nb.platformId,
                                    title: nb.title,
                                    sources: [], // No details in list view
                                    audioOverviews: [] // No details in list view
                                });
                                console.log(`  - ${nb.title} (${result.id}) [${nb.sourceCount} sources]`);
                            }
                            console.log('\n[Sync] Metadata sync complete. To scrape contents, use: rsrch notebook sync --title "Name"\n');
                        }
                    });
                } finally {
                    await store.disconnect();
                }
            } else {
                console.log('Server mode for notebook sync not yet implemented. Use --local.');
            }

        } else if (subArg1 === 'list') {
            // rsrch notebook list [--local]
            if (isLocalExecution()) {
                await runLocalNotebookAction({}, async (client, notebook) => {
                    const notebooks = await notebook.listNotebooks();
                    console.log(JSON.stringify(notebooks, null, 2));
                });
            } else {
                await sendServerRequest('/notebook/list');
            }

        } else if (subArg1 === 'stats') {
            // rsrch notebook stats "Title" [--local]
            const title = subArg2;
            if (!title) {
                console.error('Usage: rsrch notebook stats "Notebook Title" [--local]');
                process.exit(1);
            }
            if (isLocalExecution()) {
                await runLocalNotebookAction({}, async (client, notebook) => {
                    const stats = await notebook.getNotebookStats(title);
                    console.log(JSON.stringify(stats, null, 2));
                });
            } else {
                await sendServerRequest('/notebook/stats', { title });
            }

        } else if (subArg1 === 'sources') {
            // rsrch notebook sources "Title" [--local]
            const title = subArg2;
            if (!title) {
                console.error('Usage: rsrch notebook sources "Notebook Title" [--local]');
                process.exit(1);
            }
            if (isLocalExecution()) {
                await runLocalNotebookAction({}, async (client, notebook) => {
                    await notebook.openNotebook(title);
                    const sources = await notebook.getSources();
                    console.log(JSON.stringify(sources, null, 2));
                });
            } else {
                await sendServerRequest('/notebook/sources', { title });
            }

        } else if (subArg1 === 'messages') {
            // rsrch notebook messages "Title" [--local]
            const title = subArg2;
            if (!title) {
                console.error('Usage: rsrch notebook messages "Notebook Title" [--local]');
                process.exit(1);
            }
            if (isLocalExecution()) {
                await runLocalNotebookAction({}, async (client, notebook) => {
                    await notebook.openNotebook(title);
                    const messages = await notebook.getChatMessages();
                    console.log(JSON.stringify(messages, null, 2));
                });
            } else {
                await sendServerRequest('/notebook/messages', { title });
            }

        } else if (subArg1 === 'add-text') {
            // rsrch notebook add-text "Notebook Title" "Text content or @file.md" [--source-title "Custom Source Title"] [--local]
            const notebookTitle = subArg2;
            let textContent = args[3];
            let sourceTitle: string | undefined;

            // Parse optional --source-title
            for (let i = 3; i < args.length; i++) {
                if (args[i] === '--source-title' && args[i + 1]) {
                    sourceTitle = args[i + 1];
                    i++;
                } else if (!args[i].startsWith('--') && !textContent) {
                    textContent = args[i];
                }
            }

            if (!notebookTitle || !textContent) {
                console.error('Usage: rsrch notebook add-text "Notebook Title" "Text content" [--source-title "Title"] [--local]');
                console.error('       rsrch notebook add-text "Notebook Title" @file.md [--source-title "Title"] [--local]');
                console.error('       You can also pipe content: cat file.md | rsrch notebook add-text "Notebook Title" - [--local]');
                process.exit(1);
            }

            // Handle file input (@file.md) or stdin (-)
            if (textContent.startsWith('@')) {
                const filePath = textContent.slice(1);
                const fs = await import('fs');
                if (!fs.existsSync(filePath)) {
                    console.error(`File not found: ${filePath}`);
                    process.exit(1);
                }
                textContent = fs.readFileSync(filePath, 'utf-8');
                console.log(`[CLI] Loaded ${textContent.length} chars from ${filePath}`);
            } else if (textContent === '-') {
                // Read from stdin
                const readline = await import('readline');
                const rl = readline.createInterface({ input: process.stdin });
                const lines: string[] = [];
                for await (const line of rl) {
                    lines.push(line);
                }
                textContent = lines.join('\n');
                console.log(`[CLI] Read ${textContent.length} chars from stdin`);
            }

            if (isLocalExecution()) {
                await runLocalNotebookAction({}, async (client, notebook) => {
                    await notebook.addSourceText(textContent, sourceTitle, notebookTitle);
                    console.log(`\n✓ Added text source to notebook "${notebookTitle}"`);
                    if (sourceTitle) {
                        console.log(`  Source title: ${sourceTitle}`);
                    }
                    console.log(`  Content length: ${textContent.length} chars\n`);
                });
            } else {
                await sendServerRequest('/notebook/add-text', {
                    notebookTitle,
                    text: textContent,
                    sourceTitle
                });
            }

        } else if (subArg1 === 'download-batch-audio') {
            // rsrch notebook download-batch-audio --titles "A,B,C" --output "/path/to/dir" [--local]
            const parseArgs = require('util').parseArgs;
            const options = {
                titles: { type: 'string' },
                output: { type: 'string' },
                local: { type: 'boolean' }
            };
            const { values } = parseArgs({ args, options, allowPositionals: true });

            const titlesArg = values.titles;
            const outputDir = values.output;

            if (!titlesArg || !outputDir) {
                console.error('Usage: rsrch notebook download-audio --titles "Notebook1,Notebook2" --output "/path/to/dir" [--local]');
                console.error('       Use --titles "all" to download from all notebooks');
                process.exit(1);
            }

            if (isLocalExecution()) {
                await runLocalNotebookAction({}, async (client, notebook) => {
                    let notebooksToProcess: string[] = [];

                    if (titlesArg === 'all' || titlesArg === '*') {
                        console.log('[Batch] Fetching all notebooks...');
                        const allNotebooks = await notebook.listNotebooks();
                        notebooksToProcess = allNotebooks.map((n: { title: string }) => n.title);
                        console.log(`[Batch] Found ${notebooksToProcess.length} notebooks.`);
                    } else {
                        notebooksToProcess = (titlesArg as string).split(',').map((t: string) => t.trim());
                    }

                    for (const title of notebooksToProcess) {
                        console.log(`[Batch] Processing "${title}"...`);
                        try {
                            // Scrape and download with custom output directory
                            const result = await notebook.scrapeNotebook(title, true, {
                                outputDir: outputDir as string,
                                // Sanitize filename: Title_Timestamp.mp3
                                filename: `${title.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 50)}_${Date.now()}.mp3`
                            });

                            const audioCount = result.audioOverviews.length;
                            if (audioCount > 0) {
                                console.log(`[Batch] ✅ Downloaded audio for "${title}"`);
                            } else {
                                console.log(`[Batch] ⚠️ No audio found for "${title}"`);
                            }
                        } catch (e: any) {
                            console.error(`[Batch] ❌ Error processing "${title}": `, e.message);
                        }
                    }
                });
            } else {
                // Server-side implementation would go here (omitted for now as requested user only asked for CLI)
                console.error('Batch download currently only supported in --local mode.');
                process.exit(1);
            }

        } else if (subArg1 === 'artifacts') {
            // rsrch notebook artifacts "Title" [--local]
            const title = subArg2;
            if (!title) {
                console.error('Usage: rsrch notebook artifacts "Notebook Title" [--local]');
                process.exit(1);
            }
            if (isLocalExecution()) {
                await runLocalNotebookAction({}, async (client, notebook) => {
                    await notebook.openNotebook(title);
                    const artifacts = await notebook.getStudioArtifacts();
                    console.log(JSON.stringify(artifacts, null, 2));
                });
            } else {
                await sendServerRequest('/notebook/artifacts', { title });
            }

        } else if (subArg1 === 'audio-status') {
            // rsrch notebook audio-status --notebook "Title" [--local]
            let notebookTitle = undefined;

            for (let i = 2; i < args.length; i++) {
                if (args[i] === '--notebook') {
                    notebookTitle = args[i + 1];
                    i++;
                }
            }

            if (isLocalExecution()) {
                await runLocalNotebookAction({}, async (client, notebook) => {
                    const status = await notebook.checkAudioStatus(notebookTitle);
                    console.log(JSON.stringify(status, null, 2));
                });
            } else {
                await sendServerRequest('/notebook/audio-status', { notebookTitle });
            }

        } else if (subArg1 === 'generate-audio-per-source') {
            // rsrch notebook generate-audio-per-source --notebook "Title" [--prompt-template "..."] [--wet] [--local]
            let notebookTitle: string | undefined = undefined;
            let promptTemplate = 'Provide a detailed analysis focusing specifically on: {title}';
            let wetRun = false;

            for (let i = 2; i < args.length; i++) {
                if (args[i] === '--notebook') {
                    notebookTitle = args[i + 1];
                    i++;
                } else if (args[i] === '--prompt-template' || args[i] === '--prompt') {
                    promptTemplate = args[i + 1];
                    i++;
                } else if (args[i] === '--wet') {
                    wetRun = true;
                }
            }

            if (!notebookTitle) {
                console.error('Usage: rsrch notebook generate-audio-per-source --notebook "Title" [--prompt-template "Focus on: {title}"] [--wet] [--local]');
                process.exit(1);
            }

            const dryRun = !wetRun;

            if (dryRun) {
                console.log('\n🧪 DRY RUN MODE ACTIVE');
                console.log('   Audio generation will be simulated for each source.');
                console.log('   To actually generate audio, use the --wet flag.\n');
            } else {
                console.log('\n🌊 WET RUN ACTIVE');
                console.log('   Audio WILL be generated for EACH source. Quota will be consumed.\n');
            }

            if (isLocalExecution()) {
                const { getGraphStore } = await import('./graph-store');
                const store = getGraphStore();
                const graphHost = process.env.FALKORDB_HOST || 'localhost';

                await runLocalNotebookAction({}, async (client, notebook) => {
                    // Open the notebook
                    console.log(`\n[Notebook] Opening: "${notebookTitle}"...`);
                    await notebook.openNotebook(notebookTitle);

                    // Get all sources
                    console.log('[Sources] Fetching sources list...');
                    const sources = await notebook.getSources();

                    if (sources.length === 0) {
                        console.log('⚠️  No sources found in this notebook.');
                        return;
                    }

                    console.log(`\n✅ Found ${sources.length} sources:\n`);
                    sources.forEach((source: { type: string; title: string; url?: string }, index: number) => {
                        console.log(`  ${index + 1}. [${source.type}] ${source.title}`);
                    });

                    // Connect to graph for syncing
                    await store.connect(graphHost, parseInt(process.env.FALKORDB_PORT || '6379'));

                    try {
                        // Generate audio for each source
                        console.log(`\n🎵 Generating audio for each source...\n`);

                        for (let i = 0; i < sources.length; i++) {
                            const source = sources[i];
                            console.log(`\n[${i + 1}/${sources.length}] Processing: "${source.title}"`);
                            console.log(`   Type: ${source.type}`);

                            // Create custom prompt for this source
                            const customPrompt = promptTemplate.replace(/{title}/g, source.title);
                            console.log(`   Prompt: "${customPrompt}"`);

                            try {
                                // Generate audio for this specific source
                                const result = await notebook.generateAudioOverview(
                                    notebookTitle,
                                    [source.title],  // Select only this source
                                    customPrompt,
                                    true,  // Wait for completion - sequential per-source generation
                                    dryRun
                                );

                                if (result.success) {
                                    if (dryRun) {
                                        console.log(`   ✅ [DRY RUN] Audio generation simulated successfully`);
                                    } else {
                                        console.log(`   ✅ Audio generated: "${result.artifactTitle}"`);

                                        // Sync to graph
                                        try {
                                            console.log(`   [Graph] Syncing notebook state...`);
                                            const data = await notebook.scrapeNotebook(notebookTitle, false);
                                            const syncResult = await store.syncNotebook(data);

                                            // Link audio to this specific source
                                            if (result.artifactTitle) {
                                                await store.linkAudioToSources(
                                                    syncResult.id.replace('nb_', ''),
                                                    result.artifactTitle,
                                                    [source.title]
                                                );
                                                console.log(`   [Graph] Linked audio to source in graph`);
                                            }
                                        } catch (e: any) {
                                            console.error(`   ⚠️  Failed to sync to graph: ${e.message}`);
                                        }
                                    }
                                } else {
                                    console.error(`   ❌ Failed to generate audio`);
                                }

                                // Wait between generations to avoid rate limits
                                if (!dryRun && i < sources.length - 1) {
                                    console.log(`   ⏸  Waiting 10 seconds before next generation...`);
                                    await new Promise(resolve => setTimeout(resolve, 10000));
                                }

                            } catch (err: any) {
                                console.error(`   ❌ Error: ${err.message}`);
                                // Continue with next source even if one fails
                            }
                        }

                        console.log(`\n\n🎉 Completed processing ${sources.length} sources!`);

                        if (dryRun) {
                            console.log('\n💡 This was a DRY RUN. To actually generate audio, add --wet flag');
                        }
                    } finally {
                        await store.disconnect();
                    }
                });
            } else {
                console.error('Server mode for generate-audio-per-source not yet implemented. Use --local.');
                process.exit(1);
            }

        } else {
            console.log('NotebookLM commands:');
            console.log('  rsrch notebook create "Title" [--local]');
            console.log('  rsrch notebook add-source "URL" --notebook "Title" [--local]');
            console.log('  rsrch notebook add-drive-source "Doc Name" --notebook "Title" [--local]');
            console.log('  rsrch notebook generate-audio --notebook "Title" [--sources "A,B"] [--prompt "Prompt"] [--wet] [--local]');
            console.log('  rsrch notebook generate-audio-per-source --notebook "Title" [--prompt-template "Focus on: {title}"] [--wet] [--local]');
            console.log('  rsrch notebook download-audio [path] --notebook "Title" [--latest] [--pattern "regex"] [--local]');
            console.log('  rsrch notebook download-all-audio [dir] --notebook "Title" [--limit N] [--local]');
            console.log('  rsrch notebook download-batch-audio --titles "A,B" --output [dir] [--local]');
            console.log('  rsrch notebook sync [--title "Title"] [-a] [--local]');
            console.log('  rsrch notebook list [--local]');
            console.log('  rsrch notebook stats "Title" [--local]');
            console.log('  rsrch notebook sources "Title" [--local]');
            console.log('  rsrch notebook messages "Title" [--local]');
            console.log('  rsrch notebook artifacts "Title" [--local]');
            console.log('  rsrch notebook audio-status --notebook "Title" [--local]');
        }

    } else if (command === 'graph') {
        const subArg = args[1];
        const isLocalExecution = args.includes('--local');

        if (subArg === 'notebooks') {
            // rsrch graph notebooks [--limit=N]
            const limit = parseInt(args[2]?.replace('--limit=', '') || '50');

            const { getGraphStore } = await import('./graph-store');
            const store = getGraphStore();
            const graphHost = process.env.FALKORDB_HOST || 'localhost';

            try {
                await store.connect(graphHost, parseInt(process.env.FALKORDB_PORT || '6379'));
                const notebooks = await store.getNotebooks(limit);

                console.log(`\n === Synced Notebooks(${notebooks.length}) ===\n`);
                if (notebooks.length === 0) {
                    console.log('No notebooks found. Run "rsrch notebook sync" first.\n');
                } else {
                    console.table(notebooks.map(n => ({
                        ID: n.id,
                        Title: n.title,
                        Sources: n.sourceCount,
                        Audio: n.audioCount,
                        Synced: new Date(n.capturedAt).toLocaleString()
                    })));
                }
            } finally {
                await store.disconnect();
            }

        } else if (subArg === 'status') {
            // rsrch graph status [--local]
            if (isLocalExecution) {
                const { getGraphStore } = await import('./graph-store');
                const store = getGraphStore();
                const graphHost = process.env.FALKORDB_HOST || 'localhost';
                try {
                    await store.connect(graphHost, parseInt(process.env.FALKORDB_PORT || '6379'));
                    console.log('✅ FalkorDB connection: OK');
                    const jobs = await store.listJobs();
                    const queued = jobs.filter(j => j.status === 'queued').length;
                    const running = jobs.filter(j => j.status === 'running').length;
                    const completed = jobs.filter(j => j.status === 'completed').length;
                    const failed = jobs.filter(j => j.status === 'failed').length;
                    console.log(`\nJobs: ${jobs.length} total`);
                    console.log(`  Queued: ${queued}`);
                    console.log(`  Running: ${running}`);
                    console.log(`  Completed: ${completed}`);
                    console.log(`  Failed: ${failed}`);
                } finally {
                    await store.disconnect();
                }
            } else {
                await sendServerRequest('/graph/status');
            }

        } else if (subArg === 'jobs') {
            // rsrch graph jobs [status] [--local]
            const status = args[2] as any; // naive check
            if (isLocalExecution) {
                const { getGraphStore } = await import('./graph-store');
                const store = getGraphStore();
                const graphHost = process.env.FALKORDB_HOST || 'localhost';
                try {
                    await store.connect(graphHost, parseInt(process.env.FALKORDB_PORT || '6379'));
                    const jobs = status && !status.startsWith('--') ? await store.listJobs(status) : await store.listJobs();
                    console.log(`\nJobs (${jobs.length}):`);
                    for (const job of jobs) {
                        const time = new Date(job.createdAt).toISOString();
                        console.log(`  [${job.status}] ${job.id} - ${job.type}: "${job.query.substring(0, 50)}..." (${time})`);
                    }
                } finally {
                    await store.disconnect();
                }
            } else {
                // Server endpoint for jobs already exists: /jobs
                await sendServerRequest('/jobs');
                // Note: server /jobs endpoint returns full json, we might want to format it? 
                // sendServerRequest logs the JSON.
            }

        } else if (subArg === 'lineage') {
            const artifactId = args[2];
            if (!artifactId) {
                console.error('Usage: rsrch graph lineage <artifact-id>');
                process.exit(1);
            }
            if (isLocalExecution) {
                const { getGraphStore } = await import('./graph-store');
                const store = getGraphStore();
                await store.connect(process.env.FALKORDB_HOST || 'localhost', parseInt(process.env.FALKORDB_PORT || '6379'));
                try {
                    // const lineage = await store.getArtifactLineage(artifactId);
                    // console.log(JSON.stringify(lineage, null, 2));
                    console.log('Lineage not implemented in current GraphStore version');
                } finally {
                    await store.disconnect();
                }
            } else {
                console.log('Server mode for lineage not implemented');
            }

        } else if (subArg === 'conversations') {
            // rsrch graph conversations [--limit=N]
            const limit = parseInt(args[2]?.replace('--limit=', '') || '50');

            if (isLocalExecution) {
                const { getGraphStore } = await import('./graph-store');
                const store = getGraphStore();
                const graphHost = process.env.FALKORDB_HOST || 'localhost';

                try {
                    await store.connect(graphHost, parseInt(process.env.FALKORDB_PORT || '6379'));
                    // We need to implement getConversations in graph-store first or use getConversationsByPlatform
                    // For now, let's just list Gemini conversations as default orall

                    // Actually, let's use the existing getConversationsByPlatform or similar
                    // But wait, the user previously added 'getConversationsByPlatform'

                    const conversations = await store.getConversationsByPlatform('gemini', limit);

                    console.log(`\n === Synced Conversations(${conversations.length}) ===\n`);
                    console.table(conversations.map((c: any) => ({
                        ID: c.id,
                        Title: c.title,
                        Turns: c.turnCount,
                        Synced: new Date(c.capturedAt).toLocaleString()
                    })));

                } finally {
                    await store.disconnect();
                }
            } else {
                await sendServerRequest('/graph/conversations', { limit });
            }
        } else if (subArg === 'export') {
            // rsrch graph export [--platform=gemini|perplexity] [--format=md|json] [--output=path] [--since=timestamp] [--limit=N]
            let platform: 'gemini' | 'perplexity' = 'gemini';
            let format: 'md' | 'json' = 'md';
            let outputDir = './exports';
            let since: number | undefined = undefined;
            let limit = 50;

            for (let i = 2; i < args.length; i++) {
                const arg = args[i];
                if (arg.startsWith('--platform=')) {
                    platform = arg.split('=')[1] as 'gemini' | 'perplexity';
                } else if (arg.startsWith('--format=')) {
                    format = arg.split('=')[1] as 'md' | 'json';
                } else if (arg.startsWith('--output=')) {
                    outputDir = arg.split('=')[1];
                } else if (arg.startsWith('--since=')) {
                    const sinceArg = arg.split('=')[1];
                    // Parse as ISO date or timestamp
                    const parsed = Date.parse(sinceArg);
                    if (!isNaN(parsed)) {
                        since = parsed;
                    } else {
                        since = parseInt(sinceArg);
                    }
                } else if (arg.startsWith('--limit=')) {
                    limit = parseInt(arg.split('=')[1]) || 50;
                }
            }

            console.log(`\n[Export] Platform: ${platform}, Format: ${format}, Output: ${outputDir} `);
            if (since) {
                console.log(`[Export] Since: ${new Date(since).toISOString()} `);
            }
            console.log(`[Export] Limit: ${limit} \n`);

            const { exportBulk } = await import('./exporter');

            try {
                const results = await exportBulk(platform, {
                    format,
                    outputDir,
                    since,
                    limit,
                    includeResearchDocs: true,
                    includeThinking: true
                });

                console.log(`\n === Export Complete === `);
                console.log(`Exported ${results.length} conversations`);
                results.forEach(r => {
                    console.log(`  ✓ ${r.path} `);
                });
                console.log('');
            } catch (error: any) {
                console.error(`Export failed: ${error.message} `);
                process.exit(1);
            }
        } else if (subArg === 'citations') {
            // rsrch graph citations [--domain=example.com] [--limit=N]
            let domain: string | undefined;
            let limit = 50;

            for (const arg of args) {
                if (arg.startsWith('--domain=')) {
                    domain = arg.split('=')[1];
                } else if (arg.startsWith('--limit=')) {
                    limit = parseInt(arg.split('=')[1]) || 50;
                }
            }

            const { getGraphStore } = await import('./graph-store');
            const store = getGraphStore();
            const graphHost = process.env.FALKORDB_HOST || 'localhost';

            try {
                await store.connect(graphHost, parseInt(process.env.FALKORDB_PORT || '6379'));
                const citations = await store.getCitations({ domain, limit });
                console.log(`\n=== Citations (${citations.length}) ===\n`);
                console.table(citations.map(c => ({
                    ID: c.id,
                    Domain: c.domain,
                    URL: c.url.length > 60 ? c.url.substring(0, 57) + '...' : c.url,
                    FirstSeen: new Date(c.firstSeenAt).toLocaleDateString()
                })));
            } finally {
                await store.disconnect();
            }
        } else if (subArg === 'citation-usage') {
            // rsrch graph citation-usage <url>
            const url = args[2];
            if (!url) {
                console.error('Usage: rsrch graph citation-usage <url>');
                process.exit(1);
            }

            const { getGraphStore } = await import('./graph-store');
            const store = getGraphStore();
            const graphHost = process.env.FALKORDB_HOST || 'localhost';

            try {
                await store.connect(graphHost, parseInt(process.env.FALKORDB_PORT || '6379'));
                const usage = await store.getCitationUsage(url);
                if (usage.length === 0) {
                    console.log(`No usage found for: ${url}`);
                } else {
                    console.log(`\n=== Citation Usage (${usage.length}) ===\n`);
                    for (const item of usage) {
                        if (item.type === 'ResearchDoc') {
                            console.log(`  📄 ResearchDoc: ${item.id} - "${item.title || 'Untitled'}"`);
                        } else {
                            console.log(`  💬 Turn: ${item.id}`);
                        }
                    }
                }
            } finally {
                await store.disconnect();
            }
        } else if (subArg === 'migrate-citations') {
            // rsrch graph migrate-citations
            const { getGraphStore } = await import('./graph-store');
            const store = getGraphStore();
            const graphHost = process.env.FALKORDB_HOST || 'localhost';

            try {
                await store.connect(graphHost, parseInt(process.env.FALKORDB_PORT || '6379'));
                console.log('\n[Migration] Extracting citations from existing ResearchDocs...\n');
                const result = await store.migrateCitations();
                console.log(`\n=== Migration Complete ===`);
                console.log(`  Processed: ${result.processed} documents`);
                console.log(`  Created:   ${result.citations} new citation links\n`);
            } finally {
                await store.disconnect();
            }
        } else {
            console.log('Graph commands:');
            console.log('  rsrch graph notebooks [--limit=N]');
            console.log('  rsrch graph conversations [--limit=N] [--local]');
            console.log('  rsrch graph export [--platform=gemini|perplexity] [--format=md|json] [--output=path] [--since=date] [--limit=N]');
            console.log('  rsrch graph citations [--domain=example.com] [--limit=N]');
            console.log('  rsrch graph citation-usage <url>');
            console.log('  rsrch graph migrate-citations');
        }

    } else if (command === 'gemini') {
        const subArg1 = args[1]; // e.g. research
        const hasLocalFlag = args.includes('--local');
        const isLocalExecution = hasLocalFlag || !!process.env.BROWSER_CDP_ENDPOINT || !!process.env.BROWSER_WS_ENDPOINT;

        // Helper for local execution
        const runLocalGeminiAction = async (action: (client: PerplexityClient, gemini: any) => Promise<void>, sessionId?: string) => {
            console.log(`Running Gemini in ${hasLocalFlag ? 'LOCAL' : 'REMOTE BROWSER'} mode...`);
            const client = new PerplexityClient({ profileId: globalProfileId, cdpEndpoint: globalCdpEndpoint });
            await client.init({ local: hasLocalFlag, profileId: globalProfileId, cdpEndpoint: globalCdpEndpoint });
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
            // gemini deep-research "Query string" [--gem "GemName"] [--local]
            // Find query string (first non-flag arg after 'deep-research')
            let query = '';
            let gemName = undefined;

            for (let i = 2; i < args.length; i++) {
                if (args[i].startsWith('--gem=') && args[i].split('=')[1]) {
                    gemName = args[i].split('=')[1];
                } else if (!args[i].startsWith('--') && !query) {
                    query = args[i];
                } else if (args[i] === '--gem' && args[i + 1]) {
                    gemName = args[i + 1];
                    i++;
                }
            }

            if (!query) {
                console.error('Usage: rsrch gemini deep-research "Query" [--gem "GemName"] [--local] [--headed]');
                process.exit(1);
            }

            if (isLocalExecution) {
                await runLocalGeminiAction(async (client, gemini) => {
                    console.log('\n[Deep Research] Starting...');
                    if (gemName) console.log(`[Deep Research] Using Gem: ${gemName}`);
                    console.log('[Deep Research] This may take several minutes.');
                    console.log('[Deep Research] The research plan will be automatically confirmed.\n');

                    const result = await gemini.startDeepResearch(query, gemName);

                    console.log('\n--- Deep Research Result ---');
                    console.log(`Status: ${result.status} `);
                    if (result.googleDocId) {
                        console.log(`Google Doc ID: ${result.googleDocId} `);
                        console.log(`Google Doc URL: ${result.googleDocUrl} `);
                    }
                    if (result.error) {
                        console.log(`Error: ${result.error} `);
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
                        console.log(`\nSession opened: ${sessionId} `);
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
        } else if (subArg1 === 'sync-conversations') {
            // gemini sync-conversations [--limit=N] [--offset=M] [--local] [--headed]
            let limit = 10;
            let offset = 0;

            for (const arg of args) {
                if (arg.startsWith('--limit=')) {
                    limit = parseInt(arg.split('=')[1]) || 10;
                } else if (arg.startsWith('--offset=')) {
                    offset = parseInt(arg.split('=')[1]) || 0;
                }
            }

            if (isLocalExecution) {
                const { getGraphStore } = await import('./graph-store');
                const store = getGraphStore();
                const graphHost = process.env.FALKORDB_HOST || 'localhost';
                await store.connect(graphHost, parseInt(process.env.FALKORDB_PORT || '6379'));

                try {
                    await runLocalGeminiAction(async (client, gemini) => {
                        console.log(`\n[Sync] Scraping Gemini conversations (limit: ${limit}, offset: ${offset})...\n`);

                        const conversations = await gemini.scrapeConversations(limit, offset);

                        console.log(`\n[Sync] Found ${conversations.length} conversations`);

                        let synced = 0;
                        let updated = 0;
                        for (const conv of conversations) {
                            const result = await store.syncConversation({
                                platform: 'gemini',
                                platformId: conv.platformId,
                                title: conv.title,
                                type: conv.type,
                                turns: conv.turns,
                                researchDocs: conv.researchDocs
                            });
                            if (result.isNew) synced++;
                            else updated++;
                        }

                        console.log(`\n[Sync] Complete: ${synced} new, ${updated} updated\n`);
                    });
                } finally {
                    await store.disconnect();
                }
            } else {
                console.log('Server mode for sync-conversations not yet implemented. Use --local.');
            }
        } else if (subArg1 === 'upload-file') {
            // gemini upload-file [SessionID] "/path/to/file" [--local]
            let sessionId = '';
            let filePath = '';
            const nonFlagArgs: string[] = [];

            for (let i = 2; i < args.length; i++) {
                if (!args[i].startsWith('--')) {
                    nonFlagArgs.push(args[i]);
                }
            }

            if (nonFlagArgs.length >= 2) {
                sessionId = nonFlagArgs[0];
                filePath = nonFlagArgs[1];
            } else if (nonFlagArgs.length === 1) {
                filePath = nonFlagArgs[0]; // No session ID, use current/new session
            }

            if (!filePath) {
                console.error('Usage: rsrch gemini upload-file [SessionID] "/path/to/file" [--local] [--headed]');
                process.exit(1);
            }

            if (isLocalExecution) {
                await runLocalGeminiAction(async (client, gemini) => {
                    const success = await gemini.uploadFile(filePath);

                    if (success) {
                        console.log(`\n✅ File uploaded: ${filePath}`);
                    } else {
                        console.log(`\n❌ File upload failed: ${filePath}`);
                    }

                    const currentId = gemini.getCurrentSessionId();
                    if (currentId) {
                        console.log(`Session: ${currentId}`);
                    }
                }, sessionId || undefined);
            } else {
                console.log('Server mode for upload-file not yet implemented. Use --local.');
            }
        } else if (subArg1 === 'upload-files') {
            // gemini upload-files [SessionID] "/path/to/file1" "/path/to/file2" ... [--local]
            let sessionId = '';
            const filePaths: string[] = [];
            const nonFlagArgs: string[] = [];

            for (let i = 2; i < args.length; i++) {
                if (!args[i].startsWith('--')) {
                    nonFlagArgs.push(args[i]);
                }
            }

            // First arg might be session ID if it doesn't look like a path
            if (nonFlagArgs.length > 0) {
                const first = nonFlagArgs[0];
                if (!first.includes('/') && !first.includes('\\') && !first.includes('.')) {
                    sessionId = first;
                    filePaths.push(...nonFlagArgs.slice(1));
                } else {
                    filePaths.push(...nonFlagArgs);
                }
            }

            if (filePaths.length === 0) {
                console.error('Usage: rsrch gemini upload-files [SessionID] "/path/to/file1" "/path/to/file2" ... [--local]');
                process.exit(1);
            }

            if (isLocalExecution) {
                await runLocalGeminiAction(async (client, gemini) => {
                    const count = await gemini.uploadFiles(filePaths);

                    console.log(`\n✅ Uploaded ${count}/${filePaths.length} files`);

                    const currentId = gemini.getCurrentSessionId();
                    if (currentId) {
                        console.log(`Session: ${currentId}`);
                    }
                }, sessionId || undefined);
            } else {
                console.log('Server mode for upload-files not yet implemented. Use --local.');
            }

        } else if (subArg1 === 'upload-repo') {
            // gemini upload-repo <RepoURL> [SessionID] [--local] [--branch=main]
            let repoUrl = '';
            let sessionId = '';
            let branch = undefined;

            const nonFlagArgs: string[] = [];
            for (let i = 2; i < args.length; i++) {
                if (args[i].startsWith('--branch=')) {
                    branch = args[i].split('=')[1];
                } else if (!args[i].startsWith('--')) {
                    nonFlagArgs.push(args[i]);
                }
            }

            if (nonFlagArgs.length >= 1) {
                repoUrl = nonFlagArgs[0];
            }
            if (nonFlagArgs.length >= 2) {
                sessionId = nonFlagArgs[1];
            }

            if (!repoUrl) {
                console.error('Usage: rsrch gemini upload-repo <RepoURL> [SessionID] [--local] [--branch=main]');
                process.exit(1);
            }

            if (isLocalExecution) {
                await runLocalGeminiAction(async (client, gemini) => {
                    const { RepoLoader } = await import('./repo-loader');
                    const loader = new RepoLoader();

                    try {
                        console.log(`\n[Repo] Processing repository: ${repoUrl}`);
                        const contextFile = await loader.loadRepoAsFile(repoUrl, { branch });
                        console.log(`\n[Repo] Context file created at: ${contextFile}`);

                        console.log(`[Repo] Uploading to Gemini...`);
                        const success = await gemini.uploadFile(contextFile);

                        if (success) {
                            console.log(`\n✅ Repository context uploaded successfully!`);
                        } else {
                            console.log(`\n❌ Failed to upload repository context.`);
                        }
                    } catch (e: any) {
                        console.error(`\n❌ Error processing repository: ${e.message}`);
                    } finally {
                        console.log(`[Repo] Temporary files kept in temp dir for reference.`);
                    }

                }, sessionId || undefined);
            } else {
                console.log('Server mode for upload-repo not yet implemented. Use --local.');
            }
        } else if (subArg1 === 'list-gems') {
            // gemini list-gems [--local]
            if (isLocalExecution) {
                await runLocalGeminiAction(async (client, gemini) => {
                    const gems = await gemini.listGems();

                    console.log('\n--- Available Gems ---');
                    if (gems.length === 0) {
                        console.log('No gems found.');
                    } else {
                        gems.forEach((g: { name: string; id: string | null }, i: number) => {
                            console.log(`${i + 1}. ${g.name}${g.id ? ` (ID: ${g.id})` : ''}`);
                        });
                    }
                    console.log('----------------------\n');
                    console.log('JSON:', JSON.stringify(gems, null, 2));
                });
            } else {
                console.log('Server mode for list-gems not yet implemented. Use --local.');
            }
        } else if (subArg1 === 'open-gem') {
            // gemini open-gem "GemNameOrID" [--local]
            let gemNameOrId = '';
            for (let i = 2; i < args.length; i++) {
                if (!args[i].startsWith('--')) {
                    gemNameOrId = args[i];
                    break;
                }
            }

            if (!gemNameOrId) {
                console.error('Usage: rsrch gemini open-gem "GemNameOrID" [--local] [--headed]');
                process.exit(1);
            }

            if (isLocalExecution) {
                await runLocalGeminiAction(async (client, gemini) => {
                    const success = await gemini.openGem(gemNameOrId);
                    if (success) {
                        console.log(`\n✅ Opened gem: ${gemNameOrId}`);
                    } else {
                        console.log(`\n❌ Failed to open gem: ${gemNameOrId}`);
                    }
                });
            } else {
                console.log('Server mode for open-gem not yet implemented. Use --local.');
            }
        } else if (subArg1 === 'create-gem') {
            // gemini create-gem "Name" --instructions "System prompt" [--file /path/to/file] [--config gem.yaml] [--local]
            let gemName = '';
            let instructions = '';
            const files: string[] = [];
            let configPath = '';

            for (let i = 2; i < args.length; i++) {
                const arg = args[i];
                if (arg === '--instructions' && args[i + 1]) {
                    instructions = args[i + 1];
                    i++;
                } else if (arg === '--file' && args[i + 1]) {
                    files.push(args[i + 1]);
                    i++;
                } else if (arg === '--config' && args[i + 1]) {
                    configPath = args[i + 1];
                    i++;
                } else if (!arg.startsWith('--')) {
                    gemName = arg;
                }
            }

            if (configPath) {
                try {
                    const { loadGemConfig } = require('./gem-config');
                    const config = loadGemConfig(configPath);
                    if (!gemName) gemName = config.name;
                    if (!instructions) instructions = config.instructions;
                    if (config.files) files.push(...config.files);
                    console.log(`[Gemini] Loaded config from ${configPath}`);
                } catch (e: any) {
                    console.error(`Error loading config: ${e.message}`);
                    process.exit(1);
                }
            }

            if (!gemName || !instructions) {
                console.error('Usage: rsrch gemini create-gem "Name" --instructions "System prompt" [--file /path/to/file] [--config gem.yaml] [--local]');
                process.exit(1);
            }

            if (isLocalExecution) {
                await runLocalGeminiAction(async (client, gemini) => {
                    const gemId = await gemini.createGem({
                        name: gemName,
                        instructions,
                        files: files.length > 0 ? files : undefined,
                    });

                    if (gemId) {
                        console.log(`\n✅ Created gem: ${gemName} (ID: ${gemId})`);
                    } else {
                        console.log(`\n⚠️ Gem created but ID unknown: ${gemName}`);
                    }
                });
            } else {
                console.log('Server mode for create-gem not yet implemented. Use --local.');
            }
        } else if (subArg1 === 'chat-gem') {
            // gemini chat-gem "GemNameOrID" "Message" [--local]
            let gemNameOrId = '';
            let message = '';
            const nonFlagArgs: string[] = [];

            for (let i = 2; i < args.length; i++) {
                if (!args[i].startsWith('--')) {
                    nonFlagArgs.push(args[i]);
                }
            }

            if (nonFlagArgs.length >= 2) {
                gemNameOrId = nonFlagArgs[0];
                message = nonFlagArgs[1];
            }

            if (!gemNameOrId || !message) {
                console.error('Usage: rsrch gemini chat-gem "GemNameOrID" "Message" [--local] [--headed]');
                process.exit(1);
            }

            if (isLocalExecution) {
                await runLocalGeminiAction(async (client, gemini) => {
                    const response = await gemini.chatWithGem(gemNameOrId, message);

                    console.log('\n--- Response ---');
                    if (response) {
                        console.log(response);
                    } else {
                        console.log('No response received');
                    }
                    console.log('----------------\n');
                });
            } else {
                console.log('Server mode for chat-gem not yet implemented. Use --local.');
            }
        } else {
            console.log('Gemini commands:');
            console.log('  rsrch gemini research "Query" [--local]');
            console.log('  rsrch gemini deep-research "Query" [--gem "GemName"] [--local] [--headed]');
            console.log('  rsrch gemini send-message [SessionID] "Message" [--local] [--headed]');
            console.log('  rsrch gemini get-response [SessionID] [Index] [--local]  # Index: 1=first, -1=last');
            console.log('  rsrch gemini get-responses [SessionID] [--local]');
            console.log('  rsrch gemini get-research-info [SessionID] [--local]  # Get title and first heading');
            console.log('  rsrch gemini list-research-docs [Limit | SessionID] [--local] # List recent research docs');
            console.log('  rsrch gemini open-session "ID or Name" [--local] [--headed]');
            console.log('  rsrch gemini export-to-docs [SessionID] [--local] [--headed]');
            console.log('  rsrch gemini list-sessions [Limit] [Offset] [--local]');
            console.log('  rsrch gemini sync-conversations [--limit=N] [--offset=M] [--local]  # Sync conversations to graph');
            console.log('  rsrch gemini upload-file [SessionID] "/path/to/file" [--local]  # Upload PDF, image, etc.');
            console.log('  rsrch gemini upload-files [SessionID] "file1" "file2" ... [--local]  # Upload multiple files');
            console.log('  rsrch gemini upload-repo <RepoURL> [SessionID] [--branch=main] [--local]  # Upload git repo context');
            console.log('');
            console.log('Gems (custom assistants):');
            console.log('  rsrch gemini list-gems [--local]                                   # List available gems');
            console.log('  rsrch gemini open-gem "GemNameOrID" [--local]                      # Open a gem');
            console.log('  rsrch gemini create-gem "Name" --instructions "..." [--config gem.yaml] [--local]  # Create gem');
            console.log('  rsrch gemini chat-gem "GemNameOrID" "Message" [--local]            # Chat with gem');
            console.log('');
            console.log('Flags:');
            console.log('  --local    Use local browser (required for Google services)');
            console.log('  --headed   Show browser window (default: headless)');
        }

    } else if (command === 'registry') {
        // registry list [--type=session|document|audio]
        // registry show <ID>
        // registry lineage <ID>

        const registryFile = path.join(process.cwd(), 'data', 'artifact-registry.json');
        const { execSync } = require('child_process');

        const runJq = (filter: string): string => {
            try {
                return execSync(`jq '${filter}' "${registryFile}"`, { encoding: 'utf-8' }).trim();
            } catch (e: any) {
                if (e.message?.includes('No such file')) {
                    console.log('No registry file found. Run a research workflow first to create artifacts.');
                    return '';
                }
                throw e;
            }
        };

        if (subArg1 === 'list') {
            // Check for --type filter
            let typeFilter: string | undefined;
            for (const arg of args) {
                if (arg.startsWith('--type=')) {
                    typeFilter = arg.split('=')[1];
                }
            }

            if (typeFilter) {
                const result = runJq(`.artifacts | to_entries[] | select(.value.type=="${typeFilter}") | .key`);
                if (result) console.log(result);
            } else {
                const result = runJq('.artifacts | keys[]');
                if (result) console.log(result);
            }

        } else if (subArg1 === 'show') {
            const id = subArg2;
            if (!id) {
                console.error('Usage: rsrch registry show <ID>');
                process.exit(1);
            }
            const result = runJq(`.artifacts["${id}"]`);
            console.log(result || 'Not found');

        } else if (subArg1 === 'lineage') {
            const id = subArg2;
            if (!id) {
                console.error('Usage: rsrch registry lineage <ID>');
                process.exit(1);
            }

            // Recursive lineage via Node.js (jq doesn't do recursion easily)
            const { getRegistry } = require('./artifact-registry');
            const registry = getRegistry();
            const lineage = registry.getLineage(id);

            if (lineage.length === 0) {
                console.log('Not found');
            } else {
                console.log('Lineage (child → parent):');
                lineage.forEach((entry: any, idx: number) => {
                    const indent = '  '.repeat(idx);
                    console.log(`${indent}${entry.type}: ${entry.currentTitle || entry.query || entry.geminiSessionId || 'N/A'}`);
                });
            }

        } else {
            console.log('Registry commands:');
            console.log('  rsrch registry list                  # List all artifact IDs');
            console.log('  rsrch registry list --type=session   # Filter by type');
            console.log('  rsrch registry list --type=document');
            console.log('  rsrch registry list --type=audio');
            console.log('  rsrch registry show <ID>             # Show artifact details');
            console.log('  rsrch registry lineage <ID>          # Show parent chain');
        }

    } else if (command === 'query') {
        const { query, options } = parseArgs(args);
        if (query) {
            const client = new PerplexityClient({ profileId: globalProfileId, cdpEndpoint: globalCdpEndpoint });
            await client.init({ keepAlive: options.keepAlive, profileId: globalProfileId, cdpEndpoint: globalCdpEndpoint });
            try { await client.query(query, options); } finally { await client.close(); }
        } else {
            // If no direct query, fall back to legacy mode (queries.json or error)
            await runLegacyMode();
        }
    } else if (command === 'batch') {
        // Keep legacy batch
        await runLegacyMode();
    } else if (command === 'unified') {
        // rsrch unified "Query string" [--prompt "custom prompt"] [--dry-run]
        const query = args[1];
        if (!query || query.startsWith('--')) {
            console.error('Usage: rsrch unified "Query" [--prompt "..."] [--dry-run]');
            process.exit(1);
        }

        let customPrompt: string | undefined = undefined;
        let dryRun = false;

        for (let i = 2; i < args.length; i++) {
            if (args[i] === '--prompt') {
                customPrompt = args[i + 1];
                i++;
            } else if (args[i] === '--dry-run') {
                dryRun = true;
            }
        }

        await sendServerRequest('/research-to-podcast', { query, customPrompt, dryRun });
        console.log("\nUnified flow started! 🚀");
        console.log("Check server logs or Discord for progress updates.");

    } else if (command === 'graph') {
        // Graph database commands
        const graphArg1 = args[1]; // e.g. status, jobs, lineage
        const graphArg2 = args[2]; // e.g. job ID, status filter
        const { getGraphStore } = await import('./graph-store');
        const store = getGraphStore();

        try {
            const graphHost = process.env.FALKORDB_HOST || 'localhost';
            await store.connect(graphHost, parseInt(process.env.FALKORDB_PORT || '6379'));

            if (graphArg1 === 'status') {
                console.log('✅ FalkorDB connection: OK');
                const jobs = await store.listJobs();
                const queued = jobs.filter(j => j.status === 'queued').length;
                const running = jobs.filter(j => j.status === 'running').length;
                const completed = jobs.filter(j => j.status === 'completed').length;
                const failed = jobs.filter(j => j.status === 'failed').length;
                console.log(`\nJobs: ${jobs.length} total`);
                console.log(`  Queued: ${queued}`);
                console.log(`  Running: ${running}`);
                console.log(`  Completed: ${completed}`);
                console.log(`  Failed: ${failed}`);
            } else if (graphArg1 === 'jobs') {
                const status = graphArg2 as any;
                const jobs = status ? await store.listJobs(status) : await store.listJobs();
                console.log(`\nJobs (${jobs.length}):`);
                for (const job of jobs) {
                    const time = new Date(job.createdAt).toISOString();
                    console.log(`  [${job.status}] ${job.id} - ${job.type}: "${job.query.substring(0, 50)}..." (${time})`);
                }
            } else if (graphArg1 === 'lineage') {
                if (!graphArg2) {
                    console.error('Usage: rsrch graph lineage <artifact-id>');
                    process.exit(1);
                }
                const chain = await store.getLineageChain(graphArg2);
                if (!chain.job && !chain.session && !chain.document && !chain.audio) {
                    console.log(`No lineage found for: ${graphArg2}`);
                } else {
                    console.log('\nLineage Chain:');
                    if (chain.job) console.log(`  Job: ${chain.job.id} (${chain.job.type}) - "${chain.job.query.substring(0, 40)}..."`);
                    if (chain.session) console.log(`  Session: ${chain.session.id} (${chain.session.platform})`);
                    if (chain.document) console.log(`  Document: ${chain.document.id} - "${chain.document.title}"`);
                    if (chain.audio) console.log(`  Audio: ${chain.audio.id} - ${chain.audio.path}`);
                }
            } else if (graphArg1 === 'conversations') {
                // graph conversations [--platform=gemini|perplexity] [--limit=N]
                let platform: 'gemini' | 'perplexity' = 'gemini';
                let limit = 20;

                for (const arg of args) {
                    if (arg.startsWith('--platform=')) {
                        platform = arg.split('=')[1] as 'gemini' | 'perplexity';
                    } else if (arg.startsWith('--limit=')) {
                        limit = parseInt(arg.split('=')[1]) || 20;
                    }
                }

                const conversations = await store.getConversationsByPlatform(platform, limit);
                console.log(`\n${platform.toUpperCase()} Conversations (${conversations.length}):`);
                for (const conv of conversations) {
                    const captured = new Date(conv.capturedAt).toISOString().split('T')[0];
                    const typeTag = conv.type === 'deep-research' ? ' [DR]' : '';
                    console.log(`  ${conv.id}${typeTag} - "${conv.title.substring(0, 40)}..." (${conv.turnCount} turns, synced: ${captured})`);
                }
            } else if (graphArg1 === 'conversation') {
                // graph conversation <id> [--questions-only] [--answers-only] [--research-docs]
                if (!graphArg2) {
                    console.error('Usage: rsrch graph conversation <id> [--questions-only] [--answers-only] [--research-docs]');
                    process.exit(1);
                }

                const questionsOnly = args.includes('--questions-only');
                const answersOnly = args.includes('--answers-only');
                const includeResearchDocs = args.includes('--research-docs');

                const data = await store.getConversationWithFilters(graphArg2, {
                    questionsOnly,
                    answersOnly,
                    includeResearchDocs
                });

                if (!data.conversation) {
                    console.log(`Conversation not found: ${graphArg2}`);
                } else {
                    console.log(`\n=== ${data.conversation.title} ===`);
                    console.log(`Platform: ${data.conversation.platform} | Type: ${data.conversation.type}`);
                    console.log(`Synced: ${new Date(data.conversation.capturedAt).toISOString()}\n`);

                    for (const turn of data.turns) {
                        const roleLabel = turn.role === 'user' ? '👤 User' : '🤖 Assistant';
                        console.log(`${roleLabel}:`);
                        console.log(turn.content.substring(0, 500) + (turn.content.length > 500 ? '...' : ''));
                        console.log('');
                    }

                    if (data.researchDocs && data.researchDocs.length > 0) {
                        console.log('\n--- Research Documents ---');
                        for (const doc of data.researchDocs) {
                            console.log(`\n📄 ${doc.title}`);
                            console.log(`Sources: ${doc.sources.length}`);
                            console.log(doc.content.substring(0, 300) + '...');
                        }
                    }
                }
            } else if (graphArg1 === 'citations') {
                // graph citations [--domain=example.com] [--limit=N]
                let domain: string | undefined;
                let limit = 50;

                for (const arg of args) {
                    if (arg.startsWith('--domain=')) {
                        domain = arg.split('=')[1];
                    } else if (arg.startsWith('--limit=')) {
                        limit = parseInt(arg.split('=')[1]) || 50;
                    }
                }

                const citations = await store.getCitations({ domain, limit });
                console.log(`\n=== Citations (${citations.length}) ===\n`);
                console.table(citations.map(c => ({
                    ID: c.id,
                    Domain: c.domain,
                    URL: c.url.length > 60 ? c.url.substring(0, 57) + '...' : c.url,
                    FirstSeen: new Date(c.firstSeenAt).toLocaleDateString()
                })));
            } else if (graphArg1 === 'citation-usage') {
                // graph citation-usage <url>
                if (!graphArg2) {
                    console.error('Usage: rsrch graph citation-usage <url>');
                    process.exit(1);
                }

                const usage = await store.getCitationUsage(graphArg2);
                if (usage.length === 0) {
                    console.log(`No usage found for: ${graphArg2}`);
                } else {
                    console.log(`\n=== Citation Usage (${usage.length}) ===\n`);
                    for (const item of usage) {
                        if (item.type === 'ResearchDoc') {
                            console.log(`  📄 ResearchDoc: ${item.id} - "${item.title || 'Untitled'}"`);
                        } else {
                            console.log(`  💬 Turn: ${item.id}`);
                        }
                    }
                }
            } else if (graphArg1 === 'migrate-citations') {
                // graph migrate-citations
                console.log('\n[Migration] Extracting citations from existing ResearchDocs...\n');
                const result = await store.migrateCitations();
                console.log(`\n=== Migration Complete ===`);
                console.log(`  Processed: ${result.processed} documents`);
                console.log(`  Created:   ${result.citations} new citation links\n`);
            } else {
                console.log('Graph Database Commands:');
                console.log('  rsrch graph status                - Show connection status and job counts');
                console.log('  rsrch graph jobs [status]         - List jobs (optional: queued|running|completed|failed)');
                console.log('  rsrch graph lineage <id>          - Show lineage chain for artifact');
                console.log('  rsrch graph conversations         - List synced conversations [--platform=gemini] [--limit=N]');
                console.log('  rsrch graph conversation <id>     - View conversation [--questions-only] [--answers-only] [--research-docs]');
                console.log('  rsrch graph citations             - List citations [--domain=example.com] [--limit=N]');
                console.log('  rsrch graph citation-usage <url>  - Show where a URL is cited');
                console.log('  rsrch graph migrate-citations     - Migrate existing ResearchDoc sources to Citation nodes');
            }
        } catch (e: any) {
            console.error('FalkorDB connection failed:', e.message);
            console.error('Make sure FalkorDB is running: docker compose up falkordb -d');
            process.exit(1);
        } finally {
            await store.disconnect();
        }

    } else if (command === 'watch') {
        // rsrch watch [--audio] [--queue] [--folder PATH] [--once]
        const { watchForResearch, checkAndProcess } = await import('./watcher');

        let generateAudio = args.includes('--audio');
        let submitToQueue = args.includes('--queue');
        let audioFolder = process.env.HOME + '/research/audio';
        let once = args.includes('--once');

        for (let i = 1; i < args.length; i++) {
            if (args[i] === '--folder') {
                audioFolder = args[++i];
            }
        }

        if (!generateAudio && !submitToQueue && !once) {
            console.log('Usage: rsrch watch [--audio | --queue] [--folder PATH] [--once]');
            console.log('\nModes:');
            console.log('  --audio      Generate audio inline (uses local browser)');
            console.log('  --queue      Submit to server queue (recommended for production)');
            console.log('\nOptions:');
            console.log('  --folder     Save audio to folder (default: ~/research/audio)');
            console.log('  --once       Check once and exit (no continuous polling)');
            console.log('\nEnvironment:');
            console.log('  NTFY_TOPIC      - ntfy.sh topic for notifications');
            console.log('  DISCORD_WEBHOOK - Discord webhook URL');
            process.exit(0);
        }

        if (once) {
            await checkAndProcess({ generateAudio, submitToQueue, audioFolder });
        } else {
            await watchForResearch({ generateAudio, submitToQueue, audioFolder });
        }

    } else if (command === 'notify') {
        // rsrch notify "Message" [--title "Title"] [--priority low|default|high|urgent]
        const { sendNotification, loadConfigFromEnv } = await import('./notify');

        let message = '';
        let title: string | undefined;
        let priority: 'low' | 'default' | 'high' | 'urgent' = 'default';

        for (let i = 1; i < args.length; i++) {
            if (args[i] === '--title') {
                title = args[++i];
            } else if (args[i] === '--priority') {
                priority = args[++i] as any;
            } else if (!args[i].startsWith('--')) {
                message = args[i];
            }
        }

        if (!message) {
            console.log('Usage: rsrch notify "Message" [--title "Title"] [--priority low|default|high|urgent]');
            console.log('\nEnvironment variables:');
            console.log('  NTFY_TOPIC      - ntfy.sh topic (e.g., my-research)');
            console.log('  NTFY_SERVER     - ntfy server (default: https://ntfy.sh)');
            console.log('  DISCORD_WEBHOOK - Discord webhook URL');
            process.exit(1);
        }

        loadConfigFromEnv();

        console.log(`📬 Sending notification: "${message}"`);
        const results = await sendNotification(message, { title, priority });
        console.log('Results:', results);

    } else {
        console.log('Usage:');
        console.log('  rsrch auth                       - Login to Perplexity');
        console.log('  rsrch login                      - Interactive login for Docker/Remote');
        console.log('  rsrch serve                      - Start HTTP server');
        console.log('  rsrch stop                       - Stop running server');
        console.log('  rsrch shutdown                   - Force close persistent browser');
        console.log('  rsrch notebook <cmd> ...         - Manage NotebookLM (requires server)');
        console.log('  rsrch gemini <cmd> ...           - Gemini commands (research, deep-research, sessions...)');
        console.log('  rsrch unified "Query"            - Run One-Click Research-to-Podcast flow (requires server)');
        console.log('  rsrch graph <cmd> ...            - Graph database commands (status, jobs, lineage)');
        console.log('  rsrch notify "Message"           - Send notification (ntfy.sh/Discord)');
        console.log('  rsrch watch --audio              - Watch for research, generate audio, notify');
        console.log('  rsrch query "Question"           - Run localized query (standalone)');
        console.log('  rsrch query                      - Run queries from data/queries.json (standalone)');
        console.log('    Options: --session=ID|new|latest, --name=NAME, --deep, --keep-alive');
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

        const client = new PerplexityClient({ profileId: globalProfileId, cdpEndpoint: globalCdpEndpoint });
        await client.init({ profileId: globalProfileId, cdpEndpoint: globalCdpEndpoint });

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
    } else if (command === 'query') {
        // This part handles the case where 'query' is called without a direct query string,
        // implying a fallback to queries.json
        if (fs.existsSync(config.paths.queriesFile)) {
            console.log('No query argument provided. Reading from queries.json...');
            const queries = JSON.parse(fs.readFileSync(config.paths.queriesFile, 'utf-8'));
            if (Array.isArray(queries)) {
                const client = new PerplexityClient({ profileId: globalProfileId, cdpEndpoint: globalCdpEndpoint });
                await client.init({ profileId: globalProfileId, cdpEndpoint: globalCdpEndpoint });
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
