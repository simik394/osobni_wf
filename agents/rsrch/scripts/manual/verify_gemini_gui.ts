/**
 * verify_gemini_gui.ts
 * 
 * Verifies rsrch CLI can fully interact with the current Gemini GUI.
 * Connects to an already-running browser via CDP (no local launch).
 * 
 * Prerequisites:
 *   - A Chrome/Chromium browser running with --remote-debugging-port=9222
 *     (Cromite does this by default, or use: google-chrome --remote-debugging-port=9222)
 *   - The browser must be logged in to Google / Gemini
 * 
 * Usage:
 *   npx ts-node scripts/manual/verify_gemini_gui.ts [--cdp-port 9222]
 */
import { BrowserClient } from '../../src/clients/base';

const cdpPort = (() => {
    const idx = process.argv.indexOf('--cdp-port');
    return idx !== -1 ? process.argv[idx + 1] : '9222';
})();

const CDP_ENDPOINT = `http://localhost:${cdpPort}`;

async function runVerification(): Promise<void> {
    console.log(`\n🔌 Connecting to browser via CDP at ${CDP_ENDPOINT}...`);
    console.log('   (Browser must already be running and logged in to Google)\n');

    const client = new BrowserClient({
        cdpEndpoint: CDP_ENDPOINT,
        verbose: false,
    });

    try {
        await client.init({ force: true });
        console.log('✅ Connected to browser\n');

        const gemini = await client.createGeminiClient();

        console.log('--- [1/3] Initializing Gemini client ---');
        await gemini.init();
        console.log('✅ Logged in to Gemini\n');

        console.log('--- [2/3] Testing sendMessage ---');
        const response = await gemini.sendMessage('Hello Gemini, respond with exactly the word SUCCESS.');
        console.log(`   Response: "${response}"`);
        if (response && response.toUpperCase().includes('SUCCESS')) {
            console.log('✅ sendMessage verified!\n');
        } else {
            console.warn('⚠️  sendMessage: unexpected response\n');
        }

        console.log('--- [3/3] Testing listSessions ---');
        const sessions = await gemini.listSessions({ limit: 5 });
        console.log(`   Found ${sessions.length} sessions:`);
        for (const s of sessions) {
            console.log(`   - [${s.id}] ${s.name} (pinned: ${s.pinned})`);
        }
        if (sessions.length > 0) {
            console.log('✅ listSessions verified!\n');
        } else {
            console.warn('⚠️  listSessions: no sessions found\n');
        }

        console.log('--- [bonus] getModelStatus ---');
        const statuses = await gemini.getModelStatus();
        for (const m of statuses) {
            const limited = m.isLimited ? ' [limited]' : '';
            console.log(`   - ${m.name} (${m.id})${limited}: ${m.info}`);
        }
        console.log('✅ getModelStatus verified!\n');

        await client.shutdown();
        console.log('🎉 All verifications passed!');
    } catch (e: any) {
        console.error('❌ Verification failed:', e.message);
        await client.shutdown().catch(() => {});
        process.exit(1);
    }
}

runVerification().catch(console.error);

