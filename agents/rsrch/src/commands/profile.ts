import { Command } from 'commander';
import { listProfiles, getProfileInfo, deleteProfile, ensureProfileDir, getAuthFile } from '../profile';
import { cliContext } from '../cli-context';
import { listSourceProfiles, syncProfile, restartTarget, SYNC_TARGETS } from '../profile-sync';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';
import { chromium } from 'playwright';
import * as fs from 'fs';

const profile = new Command('profile').description('Profile management');

profile.command('list')
    .description('List all profiles')
    .action(() => {
        const { profileId } = cliContext.get();
        const profiles = listProfiles();
        if (profiles.length === 0) {
            console.log('No profiles found.');
        } else {
            console.log('Available profiles:');
            for (const p of profiles) {
                const authStatus = p.hasAuth ? '✓ authenticated' : '✗ no auth';
                const indicator = p.id === profileId ? ' (CLI default)' : '';
                console.log(`  ${p.id}${indicator}: ${authStatus}`);
            }
        }
    });

profile.command('info [profileId]')
    .description('Show profile details')
    .action((profileId) => {
        const { profileId: globalProfileId } = cliContext.get();
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
        const { profileId: globalProfileId } = cliContext.get();
        const id = profileId || globalProfileId;
        const cdpEndpoint = `http://localhost:${opts.cdpPort}`;

        console.log(`\n🔄 Syncing profile '${id}' to ${opts.remote}...\n`);

        // Step 1: Connect to local browser via CDP
        console.log(`[1/4] Connecting to local browser via CDP (${cdpEndpoint})...`);

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
        ensureProfileDir(id);
        const authFile = getAuthFile(id);

        const authState = {
            cookies: filteredCookies,
            origins: state.origins
        };

        fs.writeFileSync(authFile, JSON.stringify(authState, null, 2));
        console.log(`  ✓ Saved to ${authFile}`);

        // Step 4: Upload to remote server via SCP
        console.log(`[4/4] Uploading to ${opts.remote}:${opts.remotePath}/${id}/...`);

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

export const profileCommand = profile;
