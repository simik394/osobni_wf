import { Command } from 'commander';
import { sendServerRequest } from '../cli/utils';
import chalk from 'chalk';

const registry = new Command('registry').description('Artifact registry commands (Stateless API)');

registry.command('list')
    .description('List artifacts')
    .option('--type <type>', 'Filter by type (session|document|audio|research_doc|canvas)')
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
        const response = await sendServerRequest('/system/registry/list', { type: opts.type });
        const artifacts = response.data;
        
        let entries = Object.entries(artifacts);

        if (opts.json) {
            console.log(JSON.stringify(Object.fromEntries(entries), null, 2));
            return;
        }

        console.log(chalk.bold(`\nArtifact Registry (${entries.length} items)`));
        console.log('='.repeat(80));
        entries.forEach(([id, entry]: [string, any]) => {
            const title = entry.currentTitle || entry.originalTitle || entry.query || 'N/A';
            const date = new Date(entry.createdAt).toLocaleDateString();
            console.log(`${chalk.cyan(id.padEnd(10))} | ${chalk.yellow(entry.type.padEnd(12))} | ${chalk.green(date)} | ${title}`);
        });
    });

registry.command('status')
    .description('Check registry health and orphaned files')
    .action(async () => {
        const response = await sendServerRequest('/system/registry/status', {});
        const { stats, orphans } = response.data;
        
        console.log(chalk.bold('\nRegistry Health Report (via Server)'));
        console.log('='.repeat(40));
        
        Object.entries(stats).forEach(([type, count]) => {
            console.log(`${type.padEnd(15)}: ${chalk.green(count)}`);
        });

        // Orphaned files check
        console.log(chalk.bold('\nOrphaned Files Check'));
        orphans.forEach((fullPath: string) => {
            console.log(`${chalk.red('[ORPHAN]')} ${fullPath}`);
        });

        if (orphans.length === 0) {
            console.log(chalk.green('No orphaned files found. Registry is healthy.'));
        } else {
            console.log(chalk.yellow(`\nFound ${orphans.length} orphaned files. Use 'rsrch registry prune' to clean up.`));
        }
    });

registry.command('prune')
    .description('Remove orphaned files and registry entries')
    .option('--dry-run', 'Show what would be deleted without actually deleting', false)
    .action(async (opts) => {
        console.log(chalk.bold(`\nRegistry Prune (${opts.dryRun ? 'Dry Run' : 'Live'})`));
        console.log('='.repeat(40));

        const response = await sendServerRequest('/system/registry/prune', { dryRun: opts.dryRun });
        const deleted = response.deleted;
        
        deleted.forEach((fullPath: string) => {
            console.log(`${chalk.red('[DELETE]')} ${fullPath}`);
        });

        console.log(chalk.bold('\nSummary'));
        console.log('-'.repeat(20));
        console.log(`Files ${opts.dryRun ? 'to be deleted' : 'deleted'}: ${chalk.green(deleted.length)}`);
    });

registry.command('show <id>')
    .description('Show artifact details')
    .action(async (id) => {
        const response = await sendServerRequest('/system/registry/show', { id });
        if (response.data) {
            console.log(JSON.stringify(response.data, null, 2));
        } else {
            console.log(chalk.red('Artifact not found:', id));
        }
    });

registry.command('lineage <id>')
    .description('Show artifact lineage')
    .action(async (id) => {
        const response = await sendServerRequest('/system/registry/lineage', { id });
        const lineage = response.data;

        if (!lineage || lineage.length === 0) {
            console.log(chalk.red('Not found'));
        } else {
            console.log(chalk.bold('\nLineage (child → parent):'));
            lineage.forEach((entry: any, idx: number) => {
                const indent = '  '.repeat(idx);
                const prefix = idx === 0 ? '○' : '└─';
                console.log(`${indent}${chalk.blue(prefix)} ${chalk.yellow(entry.type.padEnd(12))} | ${entry.currentTitle || entry.query || entry.geminiSessionId || 'N/A'}`);
            });
        }
    });

export const registryCommand = registry;
