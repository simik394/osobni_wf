// @ts-nocheck
import { Command } from 'commander';
import {
    runLocalAction,
    getOptionsWithGlobals
} from '../cli/utils';
import { cliContext } from '../cli/context';
import { BrowserClient } from '../clients/base';
import { getGraphStore } from '../core/graph-store';
import { config } from '../config';
import { selectors } from '../selectors';
import { UniversalContext, AIModeActionDeps } from '../actions/types';
import {
    listAIModeHistoryAction,
    listAIModeMyActivityAction,
    extractAIModeConversationAction,
    syncAIModeHistoryAction,
} from '../actions/aimode/history';
import type { Page } from 'playwright';

const aimode = new Command('aimode').description('Google Search AI Mode commands');

/**
 * Helper to get AI Mode context (page + deps).
 * Reuses the existing browser client infrastructure.
 */
async function runAIModeAction(
    action: (ctx: UniversalContext, deps: AIModeActionDeps) => Promise<void>,
    options: { connectGraphStore?: boolean } = {}
) {
    const { profileId, cdpEndpoint } = cliContext.get();

    const client = new BrowserClient({ profileId, cdpEndpoint });
    const useLocalMode = cdpEndpoint ? false : true;
    await client.init({ local: useLocalMode, profileId, cdpEndpoint });

    // Get a page via tab pool for AI Mode
    const page: Page = await client.getTabPage('aimode');

    const ctx: UniversalContext = {
        page,
        log: (msg: string, level?: 'info' | 'warn' | 'error') => {
            const prefix = level === 'error' ? '[AI Mode][ERROR]' : level === 'warn' ? '[AI Mode][WARN]' : '[AI Mode]';
            console.log(`${prefix} ${msg}`);
        },
        config,
    };

    let store: any = null;
    if (options.connectGraphStore) {
        store = getGraphStore();
        await store.connect(config.falkor.host, config.falkor.port);
    }

    const deps: AIModeActionDeps = {
        selectors,
        config,
        humanDelay: async (ms: number, variance?: number) => {
            const delay = ms + (variance ? Math.random() * variance : 0);
            await page.waitForTimeout(delay);
        },
        dumpState: async (prefix: string) => {
            const fs = await import('fs');
            const path = await import('path');
            const dataDir = path.join(config.paths.resultsDir, 'debug');
            if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
            const timestamp = Date.now();
            const htmlPath = path.join(dataDir, `${prefix}_${timestamp}.html`);
            const pngPath = path.join(dataDir, `${prefix}_${timestamp}.png`);
            await fs.promises.writeFile(htmlPath, await page.content());
            await page.screenshot({ path: pngPath, fullPage: true });
            return { htmlPath, pngPath };
        },
        getGraphStore: () => store,
    };

    try {
        await action(ctx, deps);
    } finally {
        if (store) await store.disconnect().catch(() => {});
        await client.release();
        await client.close();
    }
}

// ============================================================
// COMMANDS
// ============================================================

aimode.command('list')
    .description('List AI Mode conversation history from sidebar')
    .option('--limit <number>', 'Max items to list', (v) => parseInt(v), 20)
    .action(async (opts, cmd) => {
        const globalOpts = getOptionsWithGlobals(cmd);
        const limit = opts.limit;

        await runAIModeAction(async (ctx, deps) => {
            const entries = await listAIModeHistoryAction(ctx, deps, { limit });

            console.log(`\n--- AI Mode History (${entries.length} entries) ---`);
            entries.forEach((e, i) => {
                console.log(`  ${i + 1}. ${e.query}`);
                if (e.url) console.log(`     URL: ${e.url}`);
                if (e.id) console.log(`     ID: ${e.id}`);
            });
            console.log('-------------------------------------------\n');
        });
    });

aimode.command('list-activity')
    .description('List AI Mode history from Google My Activity (product=83)')
    .option('--limit <number>', 'Max items to list', (v) => parseInt(v), 20)
    .action(async (opts, cmd) => {
        const globalOpts = getOptionsWithGlobals(cmd);
        const limit = opts.limit;

        await runAIModeAction(async (ctx, deps) => {
            const entries = await listAIModeMyActivityAction(ctx, deps, { limit });

            console.log(`\n--- AI Mode Activity (${entries.length} entries) ---`);
            entries.forEach((e, i) => {
                console.log(`  ${i + 1}. ${e.query}`);
                if (e.url) console.log(`     URL: ${e.url.substring(0, 80)}...`);
                if (e.id) console.log(`     ID: ${e.id}`);
            });
            console.log('-------------------------------------------\n');
            console.log('JSON:', JSON.stringify(entries, null, 2));
        });
    });

aimode.command('sync')
    .description('Sync AI Mode history to GraphStore')
    .option('--limit <number>', 'Max conversations to sync', (v) => parseInt(v), 10)
    .option('--no-extract', 'Skip content extraction (metadata only)')
    .action(async (opts, cmd) => {
        const globalOpts = getOptionsWithGlobals(cmd);

        await runAIModeAction(async (ctx, deps) => {
            console.log('\n🔄 Syncing AI Mode history...\n');
            const result = await syncAIModeHistoryAction(ctx, deps, {
                limit: opts.limit,
                extractContent: opts.extract !== false,
            });

            console.log('\n--- Sync Results ---');
            console.log(`  ✅ Synced:   ${result.synced}`);
            console.log(`  ⏭️  Skipped:  ${result.skipped}`);
            console.log(`  ❌ Errors:   ${result.errors}`);
            console.log('--------------------\n');
        }, { connectGraphStore: true });
    });

aimode.command('extract <url>')
    .description('Extract content from a specific AI Mode conversation URL')
    .action(async (url, opts, cmd) => {
        await runAIModeAction(async (ctx, deps) => {
            const entry = { query: 'manual extraction', url, id: null, timestamp: undefined };
            const conversation = await extractAIModeConversationAction(ctx, deps, entry);

            if (conversation) {
                console.log('\n--- Extracted Conversation ---');
                console.log(`Query: ${conversation.query}`);
                console.log(`Turns: ${conversation.turns.length}`);
                console.log(`Sources: ${conversation.sources.length}`);
                console.log('\n--- Content ---');
                for (const turn of conversation.turns) {
                    console.log(`\n[${turn.role.toUpperCase()}]`);
                    console.log(turn.content.substring(0, 500) + (turn.content.length > 500 ? '...' : ''));
                }
                console.log('------------------------------\n');
            } else {
                console.log('Failed to extract conversation.');
            }
        });
    });

export const aimodeCommand = aimode;
export default aimodeCommand;
