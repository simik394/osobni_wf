import { Command } from 'commander';
import { sendServerRequest } from '../cli/utils';

const graph = new Command('graph').description('Graph database commands');

graph.command('notebooks')
    .description('List synced notebooks')
    .option('--limit <number>', 'Limit', (v) => parseInt(v), 50)
    .action(async (opts) => {
        const response = await sendServerRequest('/graph/notebooks', { limit: opts.limit });
        if (response?.success) {
            const notebooks = response.notebooks;
            console.log(`\n === Synced Notebooks (${notebooks.length}) ===\n`);
            if (notebooks.length === 0) {
                console.log('No notebooks found. Run "rsrch notebook sync" first.\n');
            } else {
                console.table(notebooks.map((n: any) => ({
                    ID: n.id,
                    Title: n.title,
                    Sources: n.sourceCount,
                    Audio: n.audioCount,
                    Synced: new Date(n.capturedAt).toLocaleString()
                })));
            }
        }
    });

graph.command('status')
    .description('Show graph status and jobs')
    .action(async () => {
        const response = await sendServerRequest('/graph/graph/status');
        if (response && response.success) {
            console.log('✅ FalkorDB connection: OK');
            const stats = response.stats;
            console.log(`\nJobs: ${stats.total} total`);
            console.log(`  Queued: ${stats.queued}`);
            console.log(`  Running: ${stats.running}`);
            console.log(`  Completed: ${stats.completed}`);
            console.log(`  Failed: ${stats.failed}`);
        }
    });

graph.command('jobs [status]')
    .description('List jobs by status')
    .action(async (status) => {
        const response = await sendServerRequest('/jobs/jobs');
        if (response && response.success) {
            const jobs = status ? response.jobs.filter((j: any) => j.status === status) : response.jobs;
            console.log(`\nJobs (${jobs.length}):`);
            for (const job of jobs) {
                const time = new Date(job.createdAt).toISOString();
                console.log(`  [${job.status}] ${job.id} - ${job.type}: "${job.query.substring(0, 50)}..." (${time})`);
            }
        }
    });

graph.command('lineage <artifactId>')
    .description('Show lineage for an artifact')
    .action(async (artifactId) => {
        const response = await sendServerRequest(`/graph/lineage/${artifactId}`);
        if (response?.success) {
            const chain = response.chain;
            if (!chain.job && !chain.session && !chain.document && !chain.audio) {
                console.log(`No lineage found for: ${artifactId}`);
            } else {
                console.log('\nLineage Chain:');
                if (chain.job) console.log(`  Job: ${chain.job.id} (${chain.job.type}) - "${chain.job.query.substring(0, 40)}..."`);
                if (chain.session) console.log(`  Session: ${chain.session.id} (${chain.session.platform})`);
                if (chain.document) console.log(`  Document: ${chain.document.id} - "${chain.document.title}"`);
                if (chain.audio) console.log(`  Audio: ${chain.audio.id} - ${chain.audio.path}`);
            }
        }
    });

graph.command('conversations')
    .description('List conversations')
    .option('--limit <number>', 'Limit', (v) => parseInt(v), 50)
    .option('--platform <platform>', 'Platform (gemini|perplexity)', 'gemini')
    .action(async (opts) => {
        const response = await sendServerRequest('/graph/conversations', { platform: opts.platform, limit: opts.limit });
        if (response?.success) {
            const conversations = response.conversations;
            console.log(`\n${opts.platform.toUpperCase()} Conversations (${conversations.length}):`);
            for (const conv of conversations) {
                let captured = 'N/A';
                if (conv.capturedAt) {
                    captured = new Date(conv.capturedAt).toISOString().split('T')[0];
                }
                const typeTag = conv.type === 'deep-research' ? ' [DR]' : '';
                const title = conv.title || 'Untitled';
                console.log(`  ${conv.id}${typeTag} - "${title.substring(0, 40)}..." (${conv.turnCount} turns, synced: ${captured})`);
            }
        }
    });

graph.command('conversation <id>')
    .description('View conversation details')
    .option('--questions-only', 'Show questions only')
    .option('--answers-only', 'Show answers only')
    .option('--research-docs', 'Include research docs')
    .action(async (id, opts) => {
        const response = await sendServerRequest('/graph/conversation/details', {
            id,
            filters: {
                questionsOnly: opts.questionsOnly,
                answersOnly: opts.answersOnly,
                includeResearchDocs: opts.researchDocs
            }
        });

        if (response?.success) {
            if (!response.conversation) {
                console.log(`Conversation not found: ${id}`);
            } else {
                console.log(`\n=== ${response.conversation.title} ===`);
                console.log(`Platform: ${response.conversation.platform} | Type: ${response.conversation.type}`);
                console.log(`Synced: ${new Date(response.conversation.capturedAt).toISOString()}\n`);

                for (const turn of response.turns) {
                    const roleLabel = turn.role === 'user' ? '👤 User' : '🤖 Assistant';
                    console.log(`${roleLabel}:`);
                    console.log(turn.content.substring(0, 500) + (turn.content.length > 500 ? '...' : ''));
                    console.log('');
                }

                if (response.researchDocs && response.researchDocs.length > 0) {
                    console.log('\n--- Research Documents ---');
                    for (const doc of response.researchDocs) {
                        console.log(`\n📄 ${doc.title}`);
                        console.log(`Sources: ${doc.sources.length}`);
                        console.log(doc.content.substring(0, 300) + '...');
                    }
                }
            }
        }
    });

graph.command('citations')
    .description('List citations')
    .option('--domain <domain>', 'Filter by domain')
    .option('--limit <number>', 'Limit', (v) => parseInt(v), 50)
    .action(async (opts) => {
        const response = await sendServerRequest('/graph/citations', { domain: opts.domain, limit: opts.limit });
        if (response?.success) {
            const citations = response.citations;
            console.log(`\n=== Citations (${citations.length}) ===\n`);
            console.table(citations.map((c: any) => ({
                ID: c.id,
                Domain: c.domain,
                URL: c.url.length > 60 ? c.url.substring(0, 57) + '...' : c.url,
                FirstSeen: new Date(c.firstSeenAt).toLocaleDateString()
            })));
        }
    });

graph.command('citation-usage <url>')
    .description('Show where a URL is cited')
    .action(async (url) => {
        const response = await sendServerRequest('/graph/citation/usage', { url });
        if (response?.success) {
            const usage = response.usage;
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
        }
    });

graph.command('migrate-citations')
    .description('Migrate existing ResearchDocs to Citations')
    .action(async () => {
        const response = await sendServerRequest('/graph/migrate-citations');
        if (response?.success) {
            const result = response.result;
            console.log(`\n=== Migration Complete ===`);
            console.log(`  Processed: ${result.processed} documents`);
            console.log(`  Created:   ${result.citations} new citation links\n`);
        }
    });

export const graphCommand = graph;
