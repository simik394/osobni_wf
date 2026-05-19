import { Command } from 'commander';
import { sendServerRequest } from '../cli/utils';
import chalk from 'chalk';

const aimode = new Command('aimode').description('Google Search AI Mode commands');

aimode.command('list')
    .description('List AI Mode conversation history from sidebar')
    .option('--offset <number>', 'Offset to skip', (v) => parseInt(v), 0)
    .option('--size <number>', 'Number of items to retrieve', (v) => parseInt(v), 20)
    .option('--limit <number>', 'Number of items to retrieve (alias to size)', (v) => parseInt(v), 20)
    .action(async (opts) => {
        const size = opts.size !== 20 ? opts.size : opts.limit;
        const data = await sendServerRequest('/aimode/list', { offset: opts.offset, limit: size });
        if (data?.success) {
            const entries = data.data;
            console.log(chalk.bold(`\n--- AI Mode History (${entries.length} entries, offset: ${opts.offset}) ---`));
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
    .option('--offset <number>', 'Offset to skip', (v) => parseInt(v), 0)
    .option('--size <number>', 'Number of items to retrieve', (v) => parseInt(v), 20)
    .option('--limit <number>', 'Number of items to retrieve (alias to size)', (v) => parseInt(v), 20)
    .action(async (opts) => {
        const size = opts.size !== 20 ? opts.size : opts.limit;
        const data = await sendServerRequest('/aimode/list-activity', { offset: opts.offset, limit: size });
        if (data?.success) {
            const entries = data.data;
            console.log(chalk.bold(`\n--- AI Mode Activity (${entries.length} entries, offset: ${opts.offset}) ---`));
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

aimode.command('model <model>')
    .description('Switch AI Mode model ("auto" or "pro")')
    .action(async (model) => {
        if (!['auto', 'pro'].includes(model)) {
            console.error(chalk.red('Error: model must be "auto" or "pro"'));
            process.exit(1);
        }
        console.log(chalk.yellow(`Setting model to ${model}...`));
        const data = await sendServerRequest('/aimode/model', { model });
        if (data?.success) {
            console.log(chalk.green(`Successfully switched model to ${model}`));
        } else {
            console.error(chalk.red(`Failed to switch model: ${data?.error || 'Unknown error'}`));
        }
    });

aimode.command('upload <filePath>')
    .description('Upload file or image to AI Mode')
    .option('--model <model>', 'Explicitly set active model for verification ("auto" or "pro")')
    .action(async (filePath, opts) => {
        console.log(chalk.yellow(`Uploading ${filePath}...`));
        const data = await sendServerRequest('/aimode/upload', { filePath, model: opts.model });
        if (data?.success) {
            console.log(chalk.green(`Successfully uploaded: ${filePath}`));
        } else {
            console.error(chalk.red(`Failed to upload: ${data?.error || 'Unknown error'}`));
        }
    });

aimode.command('save-active')
    .description('Scrape and save active AI Mode chat turns (consolidates with existing session backup)')
    .option('-o, --output <file>', 'Custom output JSON file path')
    .action(async (opts) => {
        console.log(chalk.yellow('Scraping and saving active conversation turns...'));
        const data = await sendServerRequest('/aimode/save-active', { outputFile: opts.output });
        if (data?.success && data.data) {
            const res = data.data;
            console.log(chalk.green(`\n✅ Saved successfully!`));
            console.log(`   Path:   ${res.filePath}`);
            console.log(`   Turns:  ${res.turnCount}`);
            console.log(`   Merged: ${res.merged ? 'Yes' : 'No (First save)'}\n`);
        } else {
            console.error(chalk.red(`Failed to save: ${data?.error || 'Unknown error'}`));
        }
    });

export const aimodeCommand = aimode;
export default aimodeCommand;

