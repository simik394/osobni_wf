import { Command } from 'commander';
import { sendServerRequest } from '../cli-utils';
import { getGraphStore } from '../graph-store';
import { config } from '../config';
import { cliContext } from '../cli-context';

const graph = new Command('graph').description('Graph database commands');

graph.command('notebooks')
    .description('List synced notebooks')
    .option('--limit <number>', 'Limit', (v) => parseInt(v), 50)
    .action(async (opts) => {
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
            const store = getGraphStore();
            const graphHost = config.falkor.host;
            try {
                await store.connect(graphHost, config.falkor.port);
                console.log('✅ FalkorDB connection: OK');
                const jobs = await store.listJobs();
                const queued = jobs.filter((j) => j.status === 'queued').length;
                const running = jobs.filter((j) => j.status === 'running').length;
                const completed = jobs.filter((j) => j.status === 'completed').length;
                const failed = jobs.filter((j) => j.status === 'failed').length;
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

        const { exportBulk } = await import('../exporter');
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

export const graphCommand = graph;
