import { Command } from 'commander';
import { sendServerRequest } from '../cli/utils';
import chalk from 'chalk';

const aimode = new Command('aimode').description('Google Search AI Mode commands');

aimode.command('list')
    .description('List AI Mode conversation history from sidebar')
    .option('--limit <number>', 'Max items to list', (v) => parseInt(v), 20)
    .action(async (opts) => {
        const data = await sendServerRequest('/aimode/list', { limit: opts.limit });
        if (data?.success) {
            const entries = data.data;
            console.log(chalk.bold(`\n--- AI Mode History (${entries.length} entries) ---`));
            entries.forEach((e: any, i: number) => {
                console.log(chalk.cyan(`  ${i + 1}. ${e.query}`));
                if (e.url) console.log(chalk.dim(`     URL: ${e.url}`));
                if (e.id) console.log(chalk.dim(`     ID: ${e.id}`));
            });
            console.log(chalk.bold('-------------------------------------------\n'));
        }
    });

aimode.command('list-activity')
    .description('List AI Mode history from Google My Activity (product=83)')
    .option('--limit <number>', 'Max items to list', (v) => parseInt(v), 20)
    .action(async (opts) => {
        const data = await sendServerRequest('/aimode/list-activity', { limit: opts.limit });
        if (data?.success) {
            const entries = data.data;
            console.log(chalk.bold(`\n--- AI Mode Activity (${entries.length} entries) ---`));
            entries.forEach((e: any, i: number) => {
                console.log(chalk.cyan(`  ${i + 1}. ${e.query}`));
                if (e.url) console.log(chalk.dim(`     URL: ${e.url.substring(0, 80)}...`));
                if (e.id) console.log(chalk.dim(`     ID: ${e.id}`));
            });
            console.log(chalk.bold('-------------------------------------------\n'));
        }
    });

aimode.command('sync')
    .description('Sync AI Mode history to GraphStore')
    .option('--limit <number>', 'Max conversations to sync', (v) => parseInt(v), 10)
    .option('--no-extract', 'Skip content extraction (metadata only)')
    .action(async (opts) => {
        console.log(chalk.yellow('\n🔄 Syncing AI Mode history via server...\n'));
        const data = await sendServerRequest('/aimode/sync', {
            limit: opts.limit,
            extractContent: opts.extract !== false,
        });

        if (data?.success) {
            const result = data.data;
            console.log(chalk.bold('\n--- Sync Results ---'));
            console.log(`  ✅ Synced:   ${result.synced}`);
            console.log(`  ⏭️  Skipped:  ${result.skipped}`);
            console.log(`  ❌ Errors:   ${result.errors}`);
            console.log(chalk.bold('--------------------\n'));
        }
    });

aimode.command('extract <url>')
    .description('Extract content from a specific AI Mode conversation URL')
    .action(async (url) => {
        const data = await sendServerRequest('/aimode/extract', { url });
        if (data?.success && data.data) {
            const conversation = data.data;
            console.log(chalk.bold('\n--- Extracted Conversation ---'));
            console.log(`Query: ${conversation.query}`);
            console.log(`Turns: ${conversation.turns.length}`);
            console.log(`Sources: ${conversation.sources.length}`);
            console.log(chalk.bold('\n--- Content ---'));
            for (const turn of conversation.turns) {
                console.log(`\n[${turn.role.toUpperCase()}]`);
                console.log(turn.content.substring(0, 500) + (turn.content.length > 500 ? '...' : ''));
            }
            console.log(chalk.bold('------------------------------\n'));
        } else {
            console.log(chalk.red('Failed to extract conversation.'));
        }
    });

export const aimodeCommand = aimode;
export default aimodeCommand;
