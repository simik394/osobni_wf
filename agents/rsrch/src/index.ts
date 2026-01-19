#!/usr/bin/env node
import { Command, Option } from 'commander';
import { login } from './auth';
import { PerplexityClient } from './client';
import { startServer } from './server';
import * as fs from 'fs';
import { config } from './config';
import * as path from 'path';
import { GeminiClient, ResearchInfo } from './gemini-client';
import { listProfiles, getProfileInfo, deleteProfile } from './profile';
import { sendNotification, loadConfigFromEnv } from './notify';
import { execSync } from 'child_process';
import { WindmillClient } from './clients/windmill';
import { executeGeminiCommand, executeGeminiGet, ServerOptions } from './cli-utils';

// Helper to get options with globals (merging parent options)
function getOptionsWithGlobals(command: any): any {
    let options = {};
    let current = command;
    while (current) {
        options = { ...current.opts(), ...options };
        current = current.parent;
    }
    return options;
}

const program = new Command();

// Global state populated from options
let globalProfileId: string = 'default';
let globalCdpEndpoint: string | undefined;
let globalServerUrl: string = process.env.RSRCH_SERVER_URL || 'http://localhost:3001';

// --- Helper Functions ---

// ntfy notification helper
async function notifyNtfy(title: string, message: string, tags?: string[]) {
    const ntfyTopic = config.notifications.ntfy?.topic || 'rsrch-audio';
    const ntfyServer = config.notifications.ntfy?.server || 'https://ntfy.sh';
    try {
        await fetch(`${ntfyServer}/${ntfyTopic}`, {
            method: 'POST',
            headers: {
                'Title': title,
                'Tags': (tags || ['audio']).join(',')
            },
            body: message
        });
    } catch (e) {
        console.error(`[ntfy] Failed to send notification: ${e}`);
    }
}

// Helper to send request to server (returns data for programmatic use)
async function sendServerRequest(path: string, body: any = {}): Promise<any> {
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
        return data;
    } catch (e: any) {
        console.error(`Failed to communicate with server at port ${port}. Is it running?`);
        console.error(e.message);
        process.exit(1);
    }
}

// Helper to send request with SSE streaming (prints progress to console)
async function sendServerRequestWithSSE(path: string, body: any = {}): Promise<any> {
    const port = config.port;
    const url = `http://localhost:${port}${path}`;
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'text/event-stream'
            },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const err = await response.text();
            throw new Error(`Server error: ${response.status} ${err}`);
        }

        // Parse SSE stream
        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let result: any = null;

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || ''; // Keep incomplete line in buffer

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    try {
                        const data = JSON.parse(line.slice(6));
                        if (data.type === 'log') {
                            // Print progress message to console
                            console.log(data.message);
                        } else if (data.type === 'result') {
                            // Final result
                            result = data;
                        }
                    } catch (e) {
                        // Ignore parse errors
                    }
                }
            }
        }

        return result;
    } catch (e: any) {
        console.error(`Failed to communicate with server at port ${port}. Is it running?`);
        console.error(e.message);
        process.exit(1);
    }
}

// Helper for local Notebook execution
async function runLocalNotebookAction(action: (client: PerplexityClient, notebook: any) => Promise<void>) {
    console.log(`Running in LOCAL mode (profile: ${globalProfileId})...`);
    const client = new PerplexityClient({ profileId: globalProfileId, cdpEndpoint: globalCdpEndpoint });
    await client.init({ profileId: globalProfileId, cdpEndpoint: globalCdpEndpoint });
    const notebook = await client.createNotebookClient();
    try {
        await action(client, notebook);
    } finally {
        await client.close();
    }
}

// Helper for local Gemini execution
async function runLocalGeminiAction(action: (client: PerplexityClient, gemini: any) => Promise<void>, sessionId?: string, hasLocalFlag: boolean = true) {
    // If CDP endpoint is provided, force REMOTE mode
    const useLocalMode = globalCdpEndpoint ? false : hasLocalFlag;
    console.log(`Running Gemini in ${useLocalMode ? 'LOCAL' : 'REMOTE BROWSER'} mode...`);
    const client = new PerplexityClient({ profileId: globalProfileId, cdpEndpoint: globalCdpEndpoint });
    await client.init({ local: useLocalMode, profileId: globalProfileId, cdpEndpoint: globalCdpEndpoint });
    const gemini = await client.createGeminiClient();
    await gemini.init(sessionId); // Pass sessionId to navigate directly
    try {
        await action(client, gemini);
    } finally {
        await client.close();
    }
}

// Helper to parse query options for legacy query command
function parseQueryOptions(cmdObj: any) {
    const options: any = {};
    if (cmdObj.session) options.session = cmdObj.session;
    if (cmdObj.name) options.name = cmdObj.name;
    if (cmdObj.deep) options.deepResearch = true;
    if (cmdObj.keepAlive) options.keepAlive = true;
    return options;
}

// --- Program Configuration ---

program
    .version('1.0.31')
    .option('--profile <profileId>', 'Profile ID to use', 'default')
    .option('--cdp <url>', 'CDP Endpoint URL (for --local mode)')
    .option('--server <url>', 'Server URL for API calls', process.env.RSRCH_SERVER_URL || 'http://localhost:3001')
    .option('--local', 'Use local browser instead of server (dev only)', false)
    .option('-v, --verbose', 'Enable verbose output', false)
    .hook('preAction', (thisCommand) => {
        const opts = thisCommand.opts();
        if (opts.profile) globalProfileId = opts.profile;
        if (opts.cdp) globalCdpEndpoint = opts.cdp;
        if (opts.server) globalServerUrl = opts.server;
    });

// --- Commands ---

// Auth & Server
program.command('auth')
    .description('Login to Perplexity (headless)')
    .action(async () => {
        const { getStateDir } = await import('./profile');
        const userDataDir = getStateDir(globalProfileId);
        await login(userDataDir);
    });

program.command('login')
    .description('Interactive login for Docker/Remote')
    .action(async () => {
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
    });

program.command('serve')
    .description('Start HTTP server')
    .action(async () => {
        await startServer();
    });

program.command('stop')
    .description('Stop running server')
    .action(async () => {
        await sendServerRequest('/shutdown');
    });

program.command('shutdown')
    .description('Force close persistent browser')
    .action(async () => {
        // Assuming shutdown maps to stop/shutdown server request as in stop command or different logic if meant for browser?
        // Original code mentions 'shutdown' in help but no explicit block other than 'stop'.
        // Wait, original code: } else if (command === 'stop') { await sendServerRequest('/shutdown'); }
        // And help says: rsrch shutdown - Force close persistent browser.
        // But there is no 'shutdown' command block in original 'if/else'.
        // I will make 'shutdown' an alias for 'stop' or same action.
        await sendServerRequest('/shutdown');
    });

// Profile
const profile = program.command('profile').description('Profile management');

profile.command('list')
    .description('List all profiles')
    .action(() => {
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
    });

profile.command('info [profileId]')
    .description('Show profile details')
    .action((profileId) => {
        const id = profileId || globalProfileId;
        const info = getProfileInfo(id);
        console.log(`Profile: ${info.id}`);
        console.log(`  Auth file: ${info.authFile}`);
        console.log(`  State dir: ${info.stateDir}`);
        console.log(`  Exists: ${info.exists}`);
        console.log(`  Has auth: ${info.hasAuth}`);
    });

profile.command('delete <profileId>')
    .description('Delete a profile')
    .action((profileId) => {
        if (deleteProfile(profileId)) {
            console.log(`Profile '${profileId}' deleted.`);
        }
    });

profile.command('sync-to-remote [profileId]')
    .description('Export auth from local browser and sync to remote server')
    .option('--remote <host>', 'Remote host (e.g., halvarm or user@host)', 'halvarm')
    .option('--cdp-port <port>', 'Local CDP port', '9222')
    .option('--remote-path <path>', 'Remote profiles path', '/opt/rsrch/profiles')
    .action(async (profileId, opts) => {
        const id = profileId || globalProfileId;
        const cdpEndpoint = `http://localhost:${opts.cdpPort}`;

        console.log(`\n🔄 Syncing profile '${id}' to ${opts.remote}...\n`);

        // Step 1: Connect to local browser via CDP
        console.log(`[1/4] Connecting to local browser via CDP (${cdpEndpoint})...`);
        const { chromium } = await import('playwright');

        let browser;
        try {
            browser = await chromium.connectOverCDP(cdpEndpoint, { timeout: 5000 });
            console.log('  ✓ Connected to browser');
        } catch (e: any) {
            console.error(`  ✗ Failed to connect: ${e.message}`);
            console.error('\n  Make sure your browser is running with remote debugging enabled.');
            console.error('  For Cromite: it should be enabled by default on port 9222.\n');
            process.exit(1);
        }

        // Step 2: Extract storage state
        console.log('[2/4] Extracting session cookies and storage...');
        const contexts = browser.contexts();
        if (contexts.length === 0) {
            console.error('  ✗ No browser contexts found');
            await browser.close();
            process.exit(1);
        }

        const context = contexts[0];
        const state = await context.storageState();

        // Filter for relevant cookies (Google, Gemini, Perplexity, NotebookLM)
        const relevantDomains = ['.google.com', 'gemini.google.com', 'notebooklm.google.com', '.perplexity.ai'];
        const filteredCookies = state.cookies.filter((c: any) =>
            relevantDomains.some(d => c.domain.includes(d.replace('.', '')))
        );

        console.log(`  ✓ Extracted ${filteredCookies.length} relevant cookies`);

        // Step 3: Save auth.json locally
        console.log('[3/4] Saving auth.json...');
        const { ensureProfileDir, getAuthFile } = await import('./profile');
        ensureProfileDir(id);
        const authFile = getAuthFile(id);

        const authState = {
            cookies: filteredCookies,
            origins: state.origins
        };

        const fs = await import('fs');
        fs.writeFileSync(authFile, JSON.stringify(authState, null, 2));
        console.log(`  ✓ Saved to ${authFile}`);

        // Step 4: Upload to remote server via SCP
        console.log(`[4/4] Uploading to ${opts.remote}:${opts.remotePath}/${id}/...`);
        const { execSync } = await import('child_process');

        try {
            // Use temp file approach to handle Docker volume permissions
            const remoteTmpFile = `/tmp/rsrch_auth_${id}_${Date.now()}.json`;

            // Copy to remote /tmp first
            execSync(`scp "${authFile}" ${opts.remote}:${remoteTmpFile}`, { stdio: 'pipe' });

            // Ensure remote directory exists and move file with sudo
            execSync(`ssh ${opts.remote} "sudo mkdir -p ${opts.remotePath}/${id} && sudo cp ${remoteTmpFile} ${opts.remotePath}/${id}/auth.json && sudo chown 1200:1201 ${opts.remotePath}/${id}/auth.json && rm ${remoteTmpFile}"`, { stdio: 'pipe' });
            console.log('  ✓ Uploaded auth.json');

            // Verify
            const remoteCheck = execSync(`ssh ${opts.remote} "cat ${opts.remotePath}/${id}/auth.json | head -c 100"`, { encoding: 'utf-8' });
            if (remoteCheck.includes('"cookies"')) {
                console.log('  ✓ Verified remote auth.json');
            }
        } catch (e: any) {
            console.error(`  ✗ Upload failed: ${e.message}`);
            process.exit(1);
        }

        console.log(`\n✅ Profile '${id}' synced to ${opts.remote} successfully!\n`);
        console.log(`You can now use: rsrch --server http://${opts.remote}:3001 gemini list-sessions\n`);

        await browser.close();
    });

profile.command('sync')
    .description('Copy browser auth from local Cromite/Chromium to rsrch container')
    .option('--source <path>', 'Source browser profile path (e.g., ~/.config/chromium/"Profile 1")')
    .option('--target <name>', 'Target: local | halvarm', 'local')
    .option('--list-sources', 'List available source profiles')
    .option('--restart', 'Restart target browser after sync', true)
    .action(async (opts) => {
        const { listSourceProfiles, syncProfile, restartTarget, SYNC_TARGETS } = await import('./profile-sync');

        // List sources mode
        if (opts.listSources) {
            console.log('\n📂 Available source profiles:\n');
            const profiles = listSourceProfiles();
            for (const p of profiles) {
                console.log(`  ${p.name}${p.alias ? ` (alias: ${p.alias})` : ''}`);
                console.log(`    Path: ${p.path}`);
                console.log(`    Last modified: ${p.lastModified.toISOString()}`);
                console.log('');
            }
            console.log(`\nUsage: rsrch profile sync --source "<path>" --target <local|halvarm>\n`);
            return;
        }

        // Validate source
        if (!opts.source) {
            console.error('Error: --source is required. Use --list-sources to see available profiles.');
            process.exit(1);
        }

        // Expand ~ in path
        const path = await import('path');
        const os = await import('os');
        let sourcePath = opts.source.replace(/^~/, os.homedir());

        // Validate target
        if (!SYNC_TARGETS[opts.target]) {
            console.error(`Error: Unknown target '${opts.target}'. Available: ${Object.keys(SYNC_TARGETS).join(', ')}`);
            process.exit(1);
        }

        console.log(`\n🔐 Profile Sync`);
        console.log(`   Source: ${sourcePath}`);
        console.log(`   Target: ${SYNC_TARGETS[opts.target].name}`);
        console.log('');

        const result = syncProfile(sourcePath, opts.target);

        if (result.success) {
            console.log(`\n✅ Sync successful!`);
            console.log(`   Files: ${result.filesTransferred.join(', ') || 'none'}`);
            console.log(`   Dirs:  ${result.dirsTransferred.join(', ') || 'none'}`);

            if (result.errors.length > 0) {
                console.log(`   Warnings: ${result.errors.join(', ')}`);
            }

            if (opts.restart && result.targetRestartNeeded) {
                console.log('');
                restartTarget(opts.target);
                console.log('\n✅ Browser restarted. Auth should be active now.');
            } else if (result.targetRestartNeeded) {
                console.log('\n⚠️  Restart the target browser to apply changes.');
            }
        } else {
            console.error(`\n❌ Sync failed:`);
            for (const err of result.errors) {
                console.error(`   - ${err}`);
            }
            process.exit(1);
        }
    });

// Notebook
const notebook = program.command('notebook').description('NotebookLM commands');

notebook.command('create <title>')
    .description('Create a notebook')
    .option('--local', 'Use local execution', true) // Default true as per original code logic usually preferring local or server depending on implementation status
    .action(async (title, opts) => {
        // Original: Always use local execution - --local flag deprecated but checked
        if (true) { // Forced local as per original comment
            await runLocalNotebookAction(async (client, notebook) => {
                await notebook.createNotebook(title);
            });
        } else {
            // Unreachable in original code logic for now
            await sendServerRequest('/notebook/create', { title });
        }
    });

notebook.command('add-source <url>')
    .description('Add a source URL to a notebook')
    .option('--notebook <title>', 'Notebook title')
    .option('--local', 'Use local execution', true)
    .action(async (url, opts) => {
        if (!opts.notebook) {
            // Check if we can proceed without notebook title? Original says: if (notebookTitle) await notebook.openNotebook...
            // It seems optional if we are already in one? But CLI runs fresh.
            // Original logic: if (args[3] === '--notebook') notebookTitle = args[4];
            // If not provided, it just calls addSourceUrl(url).
        }

        await runLocalNotebookAction(async (client, notebook) => {
            if (opts.notebook) {
                await notebook.openNotebook(opts.notebook);
            }
            await notebook.addSourceUrl(url);
        });
    });

notebook.command('add-drive-source <docNames>')
    .description('Add Google Drive sources (comma-separated)')
    .option('--notebook <title>', 'Notebook title')
    .option('--local', 'Use local execution', true)
    .action(async (docNamesStr, opts) => {
        const docNames = docNamesStr.split(',').map((s: string) => s.trim()).filter((s: string) => s.length > 0);
        if (docNames.length === 0) {
            console.error('No valid document names provided.');
            process.exit(1);
        }

        await runLocalNotebookAction(async (client, notebook) => {
            await notebook.addSourceFromDrive(docNames, opts.notebook);
        });
    });

notebook.command('generate-audio')
    .alias('audio')
    .description('Generate audio for sources')
    .option('--notebook <title>', 'Notebook title')
    .option('--source <source>', 'Source name (can be used multiple times)', (val: string, memo: string[]) => { memo.push(val); return memo; }, [])
    .option('--sources <sources>', 'Comma-separated sources (legacy)')
    .option('--prompt <prompt>', 'Custom prompt')
    .option('--wet', 'Wet run (consume quota)', false)
    .option('--force', 'Force regenerate', false)
    .option('--local', 'Use local execution (Deprecated)', false)
    .action(async (opts) => {
        let sources = opts.source || [];
        if (opts.sources) {
            sources = sources.concat(opts.sources.split(',').map((s: string) => s.trim()).filter((s: string) => s.length > 0));
        }

        const dryRun = !opts.wet;

        if (dryRun) {
            console.log('\n🧪 DRY RUN MODE ACTIVE');
            console.log('   Audio generation will be simulated correctly, but the final "Generate" click will be SKIPPED.');
            console.log('   To actually generate audio (and consume quota), use the --wet flag.\n');
        } else {
            console.log('\n🌊 WET RUN ACTIVE');
            console.log('   Audio WILL be generated. Quota will be consumed.\n');
        }

        if (sources.length > 0) {
            console.log(`📝 Selected sources (${sources.length}):`);
            sources.forEach((s: string, i: number) => console.log(`   ${i + 1}. ${s}`));
        }
        if (opts.prompt) {
            console.log(`💬 Custom prompt: "${opts.prompt}"`);
        }
        if (opts.force) {
            console.log('⚡ Force mode: will regenerate even if audio already exists');
        }

        if (opts.local) {
            console.warn('\n⚠️  WARNING: --local flag is DEPRECATED for audio generation.');
            console.warn('   Routing through server -> Windmill to prevent race conditions.');
            console.warn('   Remove --local flag - it will be ignored.\n');
        }

        console.log('📤 Queueing via Windmill (prevents race conditions)...\n');
        await sendServerRequest('/notebook/generate-audio', {
            notebookTitle: opts.notebook,
            sources,
            customPrompt: opts.prompt,
            dryRun
        });
        console.log('\n✅ Audio generation queued. Check ntfy or Windmill UI for status.');
    });

notebook.command('download-audio [outputPath]')
    .description('Download audio overview')
    .requiredOption('--notebook <title>', 'Notebook title')
    .option('--local', 'Use local execution', true)
    .option('--latest', 'Latest audio only', false)
    .option('--pattern <regex>', 'Audio title pattern')
    .action(async (outputPath, opts) => {
        const finalOutputPath = outputPath || 'audio_overview.mp3';

        await runLocalNotebookAction(async (client, notebook) => {
            const resolvedOutputPath = path.resolve(process.cwd(), finalOutputPath);
            console.log(`[CLI] Downloading audio... Output: ${resolvedOutputPath}`);
            if (opts.latest) console.log(`[CLI] Mode: Latest audio only.`);
            if (opts.pattern) console.log(`[CLI] Mode: Filtering by pattern "${opts.pattern}".`);

            await notebook.downloadAudio(opts.notebook, resolvedOutputPath, {
                latestOnly: opts.latest,
                audioTitlePattern: opts.pattern
            });
        });
    });

notebook.command('download-all-audio [outputDir]')
    .description('Download all audio overviews')
    .requiredOption('--notebook <title>', 'Notebook title')
    .option('--local', 'Use local execution', true)
    .option('--limit <number>', 'Limit number of downloads', parseInt)
    .action(async (outputDir, opts) => {
        const finalOutputDir = outputDir || './audio_downloads';

        await runLocalNotebookAction(async (client, notebook) => {
            const resolvedOutputDir = path.resolve(process.cwd(), finalOutputDir);
            console.log(`[CLI] Downloading ${opts.limit ? 'top ' + opts.limit : 'ALL'} audio... Output: ${resolvedOutputDir}`);

            await notebook.downloadAllAudio(opts.notebook, resolvedOutputDir, { limit: opts.limit });
        });
    });

notebook.command('sync')
    .description('Sync notebook(s) to graph')
    .option('--title <title>', 'Notebook title (sync single)')
    .option('--pattern <regex>', 'Regex pattern to filter notebooks')
    .option('-a, --audio', 'Download audio during sync')
    .option('--local', 'Use local execution', true)
    .action(async (opts) => {
        const { getGraphStore } = await import('./graph-store');
        const store = getGraphStore();
        const graphHost = config.falkor.host;
        await store.connect(graphHost, config.falkor.port);

        try {
            await runLocalNotebookAction(async (client, notebook) => {
                if (opts.title) {
                    // Sync single notebook
                    console.log(`\n[Sync] Scraping notebook: "${opts.title}"...`);
                    if (opts.audio) console.log('[Sync] Audio download enabled (-a)');

                    const data = await notebook.scrapeNotebook(opts.title, opts.audio);
                    const result = await store.syncNotebook(data);
                    console.log(`\n[Sync] Result: ${result.isNew ? 'New' : 'Updated'} notebook ${result.id}\n`);
                } else {
                    // Sync all (or filtered) notebooks
                    console.log('\n[Sync] Listing all notebooks...');
                    let notebooks = await notebook.listNotebooks();

                    if (opts.pattern) {
                        try {
                            const regex = new RegExp(opts.pattern, 'i');
                            notebooks = notebooks.filter((nb: { title: string }) => regex.test(nb.title));
                            console.log(`[Sync] Filtered by pattern "${opts.pattern}": ${notebooks.length} notebooks found.`);
                        } catch (e: any) {
                            console.error(`[Sync] Invalid regex pattern: ${e.message}`);
                            process.exit(1);
                        }
                    }

                    console.log(`\n[Sync] Processing ${notebooks.length} notebooks. Syncing metadata...`);

                    for (const nb of notebooks) {
                        // If we are just syncing metadata, we use store.syncNotebook with minimal data
                        // But if we want DEEP sync, we should probably scrape content?
                        // Original code only synced metadata here.
                        // The user said "view the uptodate from online mirrored data", implying content. 
                        // But the original code loop just synced metadata:
                        /*
                        const result = await store.syncNotebook({
                            platformId: nb.platformId,
                            title: nb.title
                        });
                        */
                        // If the user wants FULL sync of filtered notebooks, we should probably iterate and scrape?
                        // "MAKE THE RSRCH COMMAND TO BE ABLE TO SELECT ONLY SOME..."
                        // If they select specific ones, they likely want the CONTENT.
                        // I will upgrade this loop to SCRAPE if a pattern is provided, or if explicitly asked? 
                        // Safe bet: If pattern is provided, do deep sync? Or keep it metadata-only?
                        // The `rsrch notebook sync --title` does deep sync. `rsrch notebook sync` does metadata only.
                        // I will make the loop do DEEP sync if `pattern` is present because why else filter?

                        if (opts.pattern) {
                            console.log(`  - Scraping content for "${nb.title}"...`);
                            const data = await notebook.scrapeNotebook(nb.title, opts.audio);
                            await store.syncNotebook(data);
                            console.log(`    ✓ Synced content.`);
                        } else {
                            const result = await store.syncNotebook({
                                platformId: nb.platformId,
                                title: nb.title
                            });
                            console.log(`  - ${nb.title} (${result.id}) [Metadata Only]`);
                        }
                    }
                    if (!opts.pattern) {
                        console.log('\n[Sync] Metadata sync complete. To scrape contents, use: rsrch notebook sync --title "Name" (or --pattern)\n');
                    }
                }
            });
        } finally {
            await store.disconnect();
        }
    });

notebook.command('list')
    .description('List notebooks')
    .option('--local', 'Use local execution', true)
    .action(async (opts) => {
        if (opts.local) {
            await runLocalNotebookAction(async (client, notebook) => {
                const notebooks = await notebook.listNotebooks();
                console.log(JSON.stringify(notebooks, null, 2));
            });
        } else {
            await sendServerRequest('/notebook/list');
        }
    });

notebook.command('stats <title>')
    .description('Get notebook stats')
    .option('--local', 'Use local execution', true)
    .action(async (title, opts) => {
        if (opts.local) {
            await runLocalNotebookAction(async (client, notebook) => {
                const stats = await notebook.getNotebookStats(title);
                console.log(JSON.stringify(stats, null, 2));
            });
        } else {
            await sendServerRequest('/notebook/stats', { title });
        }
    });

notebook.command('sources <title>')
    .description('List notebook sources')
    .option('--local', 'Use local execution', true)
    .action(async (title, opts) => {
        if (opts.local) {
            await runLocalNotebookAction(async (client, notebook) => {
                await notebook.openNotebook(title);
                const sources = await notebook.getSources();
                console.log(JSON.stringify(sources, null, 2));
            });
        } else {
            await sendServerRequest('/notebook/sources', { title });
        }
    });

notebook.command('messages <title>')
    .description('Get notebook chat messages')
    .option('--local', 'Use local execution', true)
    .action(async (title, opts) => {
        if (opts.local) {
            await runLocalNotebookAction(async (client, notebook) => {
                await notebook.openNotebook(title);
                const messages = await notebook.getChatMessages();
                console.log(JSON.stringify(messages, null, 2));
            });
        } else {
            await sendServerRequest('/notebook/messages', { title });
        }
    });

notebook.command('add-text <notebookTitle> <content>')
    .description('Add text or file content to notebook')
    .option('--source-title <title>', 'Custom source title')
    .option('--local', 'Use local execution', true)
    .action(async (notebookTitle, content, opts) => {
        let textContent = content;

        // Handle file input (@file.md) or stdin (-)
        if (textContent.startsWith('@')) {
            const filePath = textContent.slice(1);
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

        if (opts.local) {
            await runLocalNotebookAction(async (client, notebook) => {
                await notebook.addSourceText(textContent, opts.sourceTitle, notebookTitle);
                console.log(`\n✓ Added text source to notebook "${notebookTitle}"`);
                if (opts.sourceTitle) {
                    console.log(`  Source title: ${opts.sourceTitle}`);
                }
                console.log(`  Content length: ${textContent.length} chars\n`);
            });
        } else {
            await sendServerRequest('/notebook/add-text', {
                notebookTitle,
                text: textContent,
                sourceTitle: opts.sourceTitle
            });
        }
    });

notebook.command('download-batch-audio')
    .description('Batch download audio from multiple notebooks')
    .requiredOption('--titles <titles>', 'Comma-separated titles or "all"')
    .requiredOption('--output <dir>', 'Output directory')
    .option('--local', 'Use local execution', true)
    .action(async (opts) => {
        await runLocalNotebookAction(async (client, notebook) => {
            let notebooksToProcess: string[] = [];
            const titlesArg = opts.titles;

            if (titlesArg === 'all' || titlesArg === '*') {
                console.log('[Batch] Fetching all notebooks...');
                const allNotebooks = await notebook.listNotebooks();
                notebooksToProcess = allNotebooks.map((n: { title: string }) => n.title);
                console.log(`[Batch] Found ${notebooksToProcess.length} notebooks.`);
            } else {
                notebooksToProcess = titlesArg.split(',').map((t: string) => t.trim());
            }

            for (const title of notebooksToProcess) {
                console.log(`[Batch] Processing "${title}"...`);
                try {
                    const result = await notebook.scrapeNotebook(title, true, {
                        outputDir: opts.output,
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
    });

notebook.command('artifacts <title>')
    .description('Get notebook artifacts')
    .option('--local', 'Use local execution', true)
    .action(async (title, opts) => {
        if (opts.local) {
            await runLocalNotebookAction(async (client, notebook) => {
                await notebook.openNotebook(title);
                const artifacts = await notebook.getStudioArtifacts();
                console.log(JSON.stringify(artifacts, null, 2));
            });
        } else {
            await sendServerRequest('/notebook/artifacts', { title });
        }
    });

notebook.command('audio-status')
    .description('Check audio status')
    .requiredOption('--notebook <title>', 'Notebook title')
    .option('--local', 'Use local execution', true)
    .action(async (opts) => {
        if (opts.local) {
            await runLocalNotebookAction(async (client, notebook) => {
                const status = await notebook.checkAudioStatus(opts.notebook);
                console.log(JSON.stringify(status, null, 2));
            });
        } else {
            await sendServerRequest('/notebook/audio-status', { notebookTitle: opts.notebook });
        }
    });

notebook.command('sources-without-audio')
    .description('List sources without generated audio')
    .requiredOption('--notebook <title>', 'Notebook title')
    .action(async (opts) => {
        const { getGraphStore } = await import('./graph-store');
        const store = getGraphStore();
        const graphHost = config.falkor.host;

        try {
            await store.connect(graphHost, config.falkor.port);

            const notebooks = await store.getNotebooks(100);
            const notebook = notebooks.find(n => n.title.includes(opts.notebook) || opts.notebook.includes(n.title));

            if (!notebook) {
                console.error(`❌ Notebook "${opts.notebook}" not found in FalkorDB`);
                console.error('   Make sure to sync the notebook first: rsrch notebook sync --title "..." --local');
                process.exit(1);
            }

            const platformId = notebook.id.replace('nb_', '');
            console.log(`📓 Notebook: ${notebook.title} (${platformId})`);

            const sources = await store.getSourcesWithoutAudio(platformId);

            if (sources.length === 0) {
                console.log('✅ All sources have audio generated!');
            } else {
                console.log(`\n📋 Sources without audio (${sources.length}):\n`);
                sources.forEach((s, i) => {
                    console.log(`   ${i + 1}. ${s.title} [${s.type}]`);
                });
            }
        } finally {
            await store.disconnect();
        }
    });

// Top-level Job/Status Commands (Requirement: FalkorDB Sync)
program.command('status [jobId]')
    .description('Show system status or specific job details')
    .action(async (jobId) => {
        if (jobId) {
            // Show job details
            try {
                const response = await sendServerRequest(`/jobs/${jobId}`);
                if (response.success && response.job) {
                    const job = response.job;
                    console.log(`\n=== Job ${job.id} ===`);
                    console.log(`Type: ${job.type}`);
                    console.log(`Status: ${job.status}`);
                    console.log(`Query: ${job.query}`);
                    console.log(`Created: ${new Date(job.createdAt).toLocaleString()}`);
                    if (job.startedAt) console.log(`Started: ${new Date(job.startedAt).toLocaleString()}`);
                    if (job.completedAt) console.log(`Completed: ${new Date(job.completedAt).toLocaleString()}`);
                    if (job.error) console.log(`Error: ${job.error}`);
                    if (job.result) console.log(`Result:`, JSON.stringify(job.result, null, 2));
                    console.log('==================\n');
                } else {
                    console.error('Job not found');
                }
            } catch (e: any) {
                console.error(`Error: ${e.message}`);
            }
        } else {
            // Show system status
            try {
                const response = await sendServerRequest('/graph/status');
                if (response.success) {
                    console.log('\n=== System Status ===');
                    console.log(`Connection: ${response.connection}`);
                    if (response.stats) {
                        console.log('Jobs:', response.stats);
                    }
                    console.log('=====================\n');
                }
            } catch (e: any) {
                console.error(`Error: ${e.message}`);
            }
        }
    });

program.command('jobs')
    .description('List jobs')
    .option('--pending', 'Show pending/queued/running jobs only')
    .action(async (opts) => {
        try {
            const response = await sendServerRequest('/jobs');
            if (response.success) {
                let jobs = response.jobs;
                if (opts.pending) {
                    jobs = jobs.filter((j: any) => ['queued', 'running', 'pending', 'generating'].includes(j.status));
                }

                if (jobs.length === 0) {
                    console.log('No jobs found.');
                    return;
                }

                console.table(jobs.map((j: any) => ({
                    ID: j.id,
                    Type: j.type,
                    Status: j.status,
                    Query: j.query ? j.query.substring(0, 40) + '...' : '',
                    Created: new Date(j.createdAt).toLocaleTimeString()
                })));
            }
        } catch (e: any) {
            console.error(`Error: ${e.message}`);
        }
    });

// Graph
const graph = program.command('graph').description('Graph database commands');

graph.command('notebooks')
    .description('List synced notebooks')
    .option('--limit <number>', 'Limit', (v) => parseInt(v), 50)
    .action(async (opts) => {
        const { getGraphStore } = await import('./graph-store');
        const store = getGraphStore();
        const graphHost = config.falkor.host;
        try {
            await store.connect(graphHost, config.falkor.port);
            const notebooks = await store.getNotebooks(opts.limit);
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
    });

graph.command('status')
    .description('Show graph status and jobs')
    .option('--local', 'Use local execution', true)
    .action(async (opts) => {
        if (opts.local) {
            const { getGraphStore } = await import('./graph-store');
            const store = getGraphStore();
            const graphHost = config.falkor.host;
            try {
                await store.connect(graphHost, config.falkor.port);
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
    });

graph.command('jobs [status]')
    .description('List jobs by status')
    .option('--local', 'Use local execution', true)
    .action(async (status, opts) => {
        if (opts.local) {
            const { getGraphStore } = await import('./graph-store');
            const store = getGraphStore();
            const graphHost = config.falkor.host;
            try {
                await store.connect(graphHost, config.falkor.port);
                const jobs = status ? await store.listJobs(status) : await store.listJobs();
                console.log(`\nJobs (${jobs.length}):`);
                for (const job of jobs) {
                    const time = new Date(job.createdAt).toISOString();
                    console.log(`  [${job.status}] ${job.id} - ${job.type}: "${job.query.substring(0, 50)}..." (${time})`);
                }
            } finally {
                await store.disconnect();
            }
        } else {
            await sendServerRequest('/jobs');
        }
    });

graph.command('lineage <artifactId>')
    .description('Show lineage for an artifact')
    .action(async (artifactId) => {
        const { getGraphStore } = await import('./graph-store');
        const store = getGraphStore();
        const graphHost = config.falkor.host;
        try {
            await store.connect(graphHost, config.falkor.port);
            const chain = await store.getLineageChain(artifactId);
            if (!chain.job && !chain.session && !chain.document && !chain.audio) {
                console.log(`No lineage found for: ${artifactId}`);
            } else {
                console.log('\nLineage Chain:');
                if (chain.job) console.log(`  Job: ${chain.job.id} (${chain.job.type}) - "${chain.job.query.substring(0, 40)}..."`);
                if (chain.session) console.log(`  Session: ${chain.session.id} (${chain.session.platform})`);
                if (chain.document) console.log(`  Document: ${chain.document.id} - "${chain.document.title}"`);
                if (chain.audio) console.log(`  Audio: ${chain.audio.id} - ${chain.audio.path}`);
            }
        } finally {
            await store.disconnect();
        }
    });

graph.command('conversations')
    .description('List conversations')
    .option('--limit <number>', 'Limit', (v) => parseInt(v), 50)
    .option('--platform <platform>', 'Platform (gemini|perplexity)', 'gemini')
    .action(async (opts) => {
        const { getGraphStore } = await import('./graph-store');
        const store = getGraphStore();
        const graphHost = config.falkor.host;
        try {
            await store.connect(graphHost, config.falkor.port);
            const conversations = await store.getConversationsByPlatform(opts.platform, opts.limit);
            console.log(`\n${opts.platform.toUpperCase()} Conversations (${conversations.length}):`);
            for (const conv of conversations) {
                let captured = 'N/A';
                try {
                    if (conv.capturedAt) {
                        captured = new Date(conv.capturedAt).toISOString().split('T')[0];
                    }
                } catch (e) {
                    // ignore invalid date
                }
                const typeTag = conv.type === 'deep-research' ? ' [DR]' : '';
                const title = conv.title || 'Untitled';
                console.log(`  ${conv.id}${typeTag} - "${title.substring(0, 40)}..." (${conv.turnCount} turns, synced: ${captured})`);
            }
        } finally {
            await store.disconnect();
        }
    });

graph.command('conversation <id>')
    .description('View conversation details')
    .option('--questions-only', 'Show questions only')
    .option('--answers-only', 'Show answers only')
    .option('--research-docs', 'Include research docs')
    .action(async (id, opts) => {
        const { getGraphStore } = await import('./graph-store');
        const store = getGraphStore();
        const graphHost = config.falkor.host;
        try {
            await store.connect(graphHost, config.falkor.port);
            const data = await store.getConversationWithFilters(id, {
                questionsOnly: opts.questionsOnly,
                answersOnly: opts.answersOnly,
                includeResearchDocs: opts.researchDocs
            });

            if (!data.conversation) {
                console.log(`Conversation not found: ${id}`);
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
        } finally {
            await store.disconnect();
        }
    });

graph.command('export')
    .description('Export graph data')
    .option('--platform <platform>', 'gemini|perplexity', 'gemini')
    .option('--format <format>', 'md|json', 'md')
    .option('--output <path>', 'Output directory', './exports')
    .option('--since <date>', 'Since date (ISO or timestamp)')
    .option('--limit <number>', 'Limit', (v) => parseInt(v), 50)
    .action(async (opts) => {
        let since: number | undefined;
        if (opts.since) {
            const parsed = Date.parse(opts.since);
            if (!isNaN(parsed)) since = parsed;
            else since = parseInt(opts.since);
        }

        console.log(`\n[Export] Platform: ${opts.platform}, Format: ${opts.format}, Output: ${opts.output} `);
        if (since) console.log(`[Export] Since: ${new Date(since).toISOString()} `);
        console.log(`[Export] Limit: ${opts.limit} \n`);

        const { exportBulk } = await import('./exporter');
        try {
            const results = await exportBulk(opts.platform, {
                format: opts.format,
                outputDir: opts.output,
                since,
                limit: opts.limit,
                includeResearchDocs: true,
                includeThinking: true
            });
            console.log(`\n === Export Complete === `);
            console.log(`Exported ${results.length} conversations`);
            results.forEach(r => console.log(`  ✓ ${r.path} `));
        } catch (error: any) {
            console.error(`Export failed: ${error.message} `);
            process.exit(1);
        }
    });

graph.command('citations')
    .description('List citations')
    .option('--domain <domain>', 'Filter by domain')
    .option('--limit <number>', 'Limit', (v) => parseInt(v), 50)
    .action(async (opts) => {
        const { getGraphStore } = await import('./graph-store');
        const store = getGraphStore();
        const graphHost = config.falkor.host;
        try {
            await store.connect(graphHost, config.falkor.port);
            const citations = await store.getCitations({ domain: opts.domain, limit: opts.limit });
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
    });

graph.command('citation-usage <url>')
    .description('Show where a URL is cited')
    .action(async (url) => {
        const { getGraphStore } = await import('./graph-store');
        const store = getGraphStore();
        const graphHost = config.falkor.host;
        try {
            await store.connect(graphHost, config.falkor.port);
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
    });

graph.command('migrate-citations')
    .description('Migrate existing ResearchDocs to Citations')
    .action(async () => {
        const { getGraphStore } = await import('./graph-store');
        const store = getGraphStore();
        const graphHost = config.falkor.host;
        try {
            await store.connect(graphHost, config.falkor.port);
            console.log('\n[Migration] Extracting citations from existing ResearchDocs...\n');
            const result = await store.migrateCitations();
            console.log(`\n=== Migration Complete ===`);
            console.log(`  Processed: ${result.processed} documents`);
            console.log(`  Created:   ${result.citations} new citation links\n`);
        } finally {
            await store.disconnect();
        }
    });

// Gemini
const gemini = program.command('gemini').description('Gemini commands');

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

        gemini.command('research <query>')
            .description('Research a topic with Gemini')
            .option('--model <name>', 'Gemini Model (e.g. "Gemini 3 Pro", "Gemini 3 Flash")')
            .option('-d, --deep', 'Enable Deep Research mode')
            .option('-s, --session <id>', 'Session ID')
            .action(async (query, opts, cmdObj) => {
                const options = getOptionsWithGlobals(cmdObj);
                const model = options.model;
                const useServer = !options.local;

                if (useServer) {
                    // Use sendServerRequest with SSE if supported, or just wait?
                    // server.ts /gemini/research uses SSE if header present.
                    await sendServerRequestWithSSE('/gemini/research', {
                        query,
                        model,
                        deepResearch: options.deep,
                        sessionId: options.session
                    });
                } else {
                    await runLocalGeminiAction(async (client, gemini) => {
                        const response = await gemini.research(query, {
                            model,
                            deepResearch: options.deep,
                            sessionId: options.session
                        });
                        console.log('\nResult:\n', response);
                    });
                }
            });

        gemini.command('list-sessions')

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
            const result = await executeGeminiGet('sessions', { limit, offset }, { server: globalServerUrl });
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


        const globalOpts = cmd.optsWithGlobals();
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

            // Import the streaming helper here to avoid circular dep issues if any, 
            // though cli-utils handles it.
            const { executeGeminiStream } = await import('./cli-utils');

            if (waitForResponse) {
                console.log('\n--- Response ---');
                let fullResponse = '';

                let lastLength = 0;
                await executeGeminiStream('chat', { message, sessionId, waitForResponse: true }, { server: globalServerUrl }, (data: any) => {
                    if (data.type === 'progress' && data.text) {
                        if (cmd.optsWithGlobals().verbose) {
                            console.log(`[Chunk] ${JSON.stringify(data.text.substring(Math.max(0, data.text.length - 20)))}`);
                        }
                        const text = data.text;

                        // Specific logic for handling "Thoughts" block expansion which might inject text at start
                        if (text.length >= lastLength && text.startsWith(fullResponse)) {
                            // Standard append case
                            const newContent = text.substring(lastLength);
                            process.stdout.write(newContent);
                            lastLength = text.length;
                            fullResponse = text;
                        } else {
                            // Text changed non-additively (e.g. thought block expansion or content rewrite)
                            // Clear line and reprint from start or diff point?
                            // Simplest for CLI: Just print everything if it diverged significantly, but that duplicates.
                            // Better: If we detect divergence, we might need to clear screen or just accept duplication for now?
                            // Actually, let's try to be smart:

                            // If the new text is SHORTER, something is wrong or reset.
                            // If longer but doesn't start with old, content was injected.

                            // Let's rely on standard stdout behavior: we can't easily "edit" previous lines without full TUI.
                            // But we CAN detect if we should print a newline and start over, or just print the diff.

                            // Heuristic: If we are in "thought" mode, the model might inject text at the top.
                            // If we detect the stored 'fullResponse' is NOT a prefix of 'text', 
                            // it means the text we already printed is invalid or has shifted.

                            // HACK: for now, just print the *new* part if it seems like an append, 
                            // OR if it's a completely new block (thoughts), print via newline.

                            // Refined approach:
                            // 1. Find common prefix length
                            let commonPrefixLen = 0;
                            const minLen = Math.min(fullResponse.length, text.length);
                            while (commonPrefixLen < minLen && fullResponse[commonPrefixLen] === text[commonPrefixLen]) {
                                commonPrefixLen++;
                            }

                            // If common prefix is full previous text, it's a pure append.
                            if (commonPrefixLen === fullResponse.length) {
                                const newContent = text.substring(lastLength);
                                process.stdout.write(newContent);
                            } else {
                                // Content diverged. This happens when "Thoughts" expands at the top.
                                // We have printed 'fullResponse'. The new text is 'text'.
                                // The part storing 'fullResponse' on screen is 'dirty'. 
                                // We should ideally clear it, but we can't reliably.

                                // COMPROMISE: Print a marker and the new full text? No, too spammy.
                                // Print ONLY the divergent part? 

                                // If "Thoughts" appeared at the start, 'text' will start with "[Thought Process...]" and then have the old text.
                                // detecting that pattern:
                                const divergence = text.substring(commonPrefixLen);
                                process.stdout.write('\n[Update] ' + divergence);
                            }

                            lastLength = text.length;
                            fullResponse = text;
                        }
                    } else if (data.type === 'result' && data.response) {
                        // If we haven't streamed anything yet, print the full response now
                        if (fullResponse.length === 0) {
                            process.stdout.write(data.response);
                        }
                        fullResponse = data.response;
                    } else if (data.type === 'error') {
                        console.error(`\n[Stream Error] ${data.error}`);
                    }
                });

                // Ensure newline at end
                if (!fullResponse.endsWith('\n')) console.log('');
                console.log('----------------\n');
            } else {
                // Non-blocking submission
                // We can use executeGeminiCommand (simple POST) instead of stream if we don't care about events.
                // But strictly speaking, we want to start the generation.
                // If we use simple POST with waitForResponse: false, the server returns immediately.
                const { executeGeminiCommand } = await import('./cli-utils');
                const result = await executeGeminiCommand('chat', { message, sessionId, waitForResponse: false }, { server: globalServerUrl });
                console.log('Message submitted successfully (async).');
                if (cmd.optsWithGlobals().verbose) {
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

        const globalOpts = cmd.optsWithGlobals();

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

        // Production mode
        try {
            // Note: Server doesn't currently support getResponse(idx) directly, 
            // but we can fetch all and filter client side for now or assume user wants all if no idx support on server.
            // Actually get-responses endpoint returns ALL.
            // Let's implement getting specific index client-side from the full list for now.
            const result = await executeGeminiCommand('get-responses', { sessionId }, { server: globalServerUrl });
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
        const globalOpts = cmd.optsWithGlobals();

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

        // Production mode
        try {
            const result = await executeGeminiCommand('get-responses', { sessionId }, { server: globalServerUrl });
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
        const globalOpts = cmd.optsWithGlobals();

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

        // Production mode
        try {
            const result = await executeGeminiCommand('get-research-info', { sessionId }, { server: globalServerUrl });
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

        const globalOpts = cmd.optsWithGlobals();

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

        // Production Mode (Note: Server currently may not implement listResearchDocs fully, using basic impl)
        try {
            const result = await executeGeminiCommand('list-research-docs', { sessionId, limit }, { server: globalServerUrl });
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

gemini.command('sync-conversations')
    .description('Sync conversations to graph')
    .option('--limit <number>', 'Limit', (v) => parseInt(v), 10)
    .option('--offset <number>', 'Offset', (v) => parseInt(v), 0)
    .option('--async', 'Run in background and return immediately', false)
    .option('--stream', 'Show real-time progress streaming', true)
    .option('--no-stream', 'Disable real-time progress streaming')
    .action(async (opts, cmd) => {
        const globalOpts = cmd.optsWithGlobals();

        if (globalOpts.local) {
            // Dev mode: direct browser + local FalkorDB
            const { getGraphStore } = await import('./graph-store');
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

        // Production mode: call server API
        try {
            if (opts.async) {
                console.log(`[CLI] Submitting background sync job (limit: ${opts.limit}, offset: ${opts.offset})...`);
                const result = await executeGeminiCommand('sync-conversations', {
                    limit: opts.limit,
                    offset: opts.offset,
                    async: true
                }, { server: globalServerUrl });

                console.log(`\n--- Sync Job Submitted ---`);
                console.log(`  Job ID: ${result.jobId}`);
                console.log(`  Status: ${result.message}`);
                console.log(`  Check status at: ${result.statusUrl}`);
                console.log(`---------------------------\n`);
                return;
            }

            if (opts.stream !== false) {
                console.log(`[CLI] Starting sync with real-time updates...`);
                // Use dynamic import to avoid circular dependency
                const { executeGeminiStream } = await import('./cli-utils');
                const result = await executeGeminiStream('sync-conversations', {
                    limit: opts.limit,
                    offset: opts.offset
                }, { server: globalServerUrl }, (event: any) => {
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
                }, { server: globalServerUrl });

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
        // Commander might parse args differently if optional arg is in middle.
        // Here path is required, sessionId optional.
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
        // This is tricky with variadic args.
        // We'll rely on our manual parsing in the action if needed, or refine the command definition.
        // Actually, let's keep it simple: if first arg doesn't look like a file and looks like ID?
        // But commander handles variadic at the end.
        // Let's use the 'files...' as the only arg and inspect first element.

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
            const { RepoLoader } = await import('./repo-loader');
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
        const globalOpts = cmd.optsWithGlobals();

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
            const result = await executeGeminiGet('gems', {}, { server: globalServerUrl });
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
        const globalOpts = cmd.optsWithGlobals();

        if (globalOpts.local) {
            await runLocalGeminiAction(async (client, gemini) => {
                const success = await gemini.openGem(gemNameOrId);
                if (success) console.log(`\n✅ Opened gem: ${gemNameOrId}`);
                else console.log(`\n❌ Failed to open gem: ${gemNameOrId}`);
            });
            return;
        }

        try {
            // Note: open-gem on server keeps state in the single browser instance
            await executeGeminiCommand('open-gem', { gemNameOrId }, { server: globalServerUrl });
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
                const { loadGemConfig } = require('./gem-config');
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
        const globalOpts = cmd.optsWithGlobals();

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
            const result = await executeGeminiCommand('chat-gem', { gemNameOrId, message }, { server: globalServerUrl });
            console.log('\n--- Response ---');
            console.log(result.data?.response || result.response || 'No response data');
            console.log('----------------\n');
        } catch (e: any) {
            console.error(`[CLI] Error: ${e.message}`);
            process.exit(1);
        }
    });

// Registry
const registry = program.command('registry').description('Artifact registry commands');

registry.command('list')
    .description('List artifacts')
    .option('--type <type>', 'Filter by type (session|document|audio)')
    .action((opts) => {
        const registryFile = path.join(process.cwd(), 'data', 'artifact-registry.json');

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

        if (opts.type) {
            const result = runJq(`.artifacts | to_entries[] | select(.value.type=="${opts.type}") | .key`);
            if (result) console.log(result);
        } else {
            const result = runJq('.artifacts | keys[]');
            if (result) console.log(result);
        }
    });

registry.command('show <id>')
    .description('Show artifact details')
    .action((id) => {
        const registryFile = path.join(process.cwd(), 'data', 'artifact-registry.json');
        try {
            const result = execSync(`jq '.artifacts["${id}"]' "${registryFile}"`, { encoding: 'utf-8' }).trim();
            console.log(result || 'Not found');
        } catch (e) { console.log('Not found'); }
    });

registry.command('lineage <id>')
    .description('Show artifact lineage')
    .action((id) => {
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
    });

// Standalone Commands
program.command('query [query]')
    .description('Run a research query (standalone)')
    .option('--session <session>', 'Session ID')
    .option('--name <name>', 'Session Name')
    .option('--deep', 'Deep research mode')
    .option('--keep-alive', 'Keep browser open')
    .action(async (query, opts) => {
        if (query) {
            const client = new PerplexityClient({ profileId: globalProfileId, cdpEndpoint: globalCdpEndpoint });
            await client.init({ keepAlive: opts.keepAlive, profileId: globalProfileId, cdpEndpoint: globalCdpEndpoint });
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
                    const client = new PerplexityClient({ profileId: globalProfileId, cdpEndpoint: globalCdpEndpoint });
                    await client.init({ profileId: globalProfileId, cdpEndpoint: globalCdpEndpoint });
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

program.command('batch <file>')
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
    });

program.command('unified <query>')
    .description('Run One-Click Research-to-Podcast flow')
    .option('--prompt <prompt>', 'Custom prompt')
    .option('--dry-run', 'Dry run')
    .action(async (query, opts) => {
        await sendServerRequest('/research-to-podcast', { query, customPrompt: opts.prompt, dryRun: opts.dryRun });
        console.log("\nUnified flow started! 🚀");
        console.log("Check server logs or Discord for progress updates.");
    });

program.command('watch')
    .description('Watch for research and generate audio')
    .option('--audio', 'Generate audio inline')
    .option('--queue', 'Submit to server queue')
    .option('--folder <path>', 'Audio folder path')
    .option('--once', 'Run once and exit')
    .action(async (opts) => {
        if (!opts.audio && !opts.queue && !opts.once) {
            console.log('Usage: rsrch watch [--audio | --queue] [--folder PATH] [--once]');
            process.exit(0);
        }

        const { watchForResearch, checkAndProcess } = await import('./watcher');
        const audioFolder = opts.folder || process.env.HOME + '/research/audio';

        if (opts.once) {
            await checkAndProcess({ generateAudio: opts.audio, submitToQueue: opts.queue, audioFolder });
        } else {
            await watchForResearch({ generateAudio: opts.audio, submitToQueue: opts.queue, audioFolder });
        }
    });

program.command('notify <message>')
    .description('Send a notification')
    .option('--title <title>', 'Notification title')
    .option('--priority <level>', 'Priority (low|default|high|urgent)', 'default')
    .action(async (message, opts) => {
        const { sendNotification, loadConfigFromEnv } = await import('./notify');
        loadConfigFromEnv();
        console.log(`📬 Sending notification: "${message}"`);
        const results = await sendNotification(message, { title: opts.title, priority: opts.priority });
        console.log('Results:', results);
    });

program.parse(process.argv);
