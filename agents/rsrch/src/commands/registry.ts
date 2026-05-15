import { Command } from 'commander';
import * as path from 'path';
import * as fs from 'fs';
import { execSync } from 'child_process';
import { getRegistry } from '../core/artifact-registry';
import chalk from 'chalk';

const registry = new Command('registry').description('Artifact registry commands');

registry.command('list')
    .description('List artifacts')
    .option('--type <type>', 'Filter by type (session|document|audio|research_doc|canvas)')
    .option('--json', 'Output as JSON')
    .action((opts) => {
        const reg = getRegistry();
        const artifacts = reg.listAll();
        
        let entries = Object.entries(artifacts);
        if (opts.type) {
            entries = entries.filter(([_, v]) => v.type === opts.type);
        }

        if (opts.json) {
            console.log(JSON.stringify(Object.fromEntries(entries), null, 2));
            return;
        }

        console.log(chalk.bold(`\nArtifact Registry (${entries.length} items)`));
        console.log('='.repeat(80));
        entries.forEach(([id, entry]) => {
            const title = entry.currentTitle || entry.originalTitle || entry.query || 'N/A';
            const date = new Date(entry.createdAt).toLocaleDateString();
            console.log(`${chalk.cyan(id.padEnd(10))} | ${chalk.yellow(entry.type.padEnd(12))} | ${chalk.green(date)} | ${title}`);
        });
    });

registry.command('status')
    .description('Check registry health and orphaned files')
    .action(() => {
        const reg = getRegistry();
        const artifacts = reg.listAll();
        const ids = Object.keys(artifacts);
        
        console.log(chalk.bold('\nRegistry Health Report'));
        console.log('='.repeat(40));
        
        // Stats by type
        const stats: Record<string, number> = {};
        ids.forEach(id => {
            const type = artifacts[id].type;
            stats[type] = (stats[type] || 0) + 1;
        });

        Object.entries(stats).forEach(([type, count]) => {
            console.log(`${type.padEnd(15)}: ${chalk.green(count)}`);
        });

        // Orphaned files check
        console.log(chalk.bold('\nOrphaned Files Check'));
        const artifactDirs = ['data/artifacts/gemini', 'data/artifacts/notebooklm', 'data/audio'];
        let orphanedCount = 0;
        
        const registeredPaths = new Set(
            Object.values(artifacts)
                .map(a => a.markdownPath || a.localPath)
                .filter(Boolean)
                .map(p => path.resolve(p!))
        );

        artifactDirs.forEach(dir => {
            const fullDir = path.join(process.cwd(), dir);
            if (!fs.existsSync(fullDir)) return;

            const files = fs.readdirSync(fullDir, { recursive: true }) as string[];
            files.forEach(file => {
                const fullPath = path.join(fullDir, file);
                if (fs.statSync(fullPath).isDirectory()) return;
                
                if (!registeredPaths.has(path.resolve(fullPath))) {
                    console.log(`${chalk.red('[ORPHAN]')} ${fullPath}`);
                    orphanedCount++;
                }
            });
        });

        if (orphanedCount === 0) {
            console.log(chalk.green('No orphaned files found. Registry is healthy.'));
        } else {
            console.log(chalk.yellow(`\nFound ${orphanedCount} orphaned files. Use 'rsrch registry prune' to clean up.`));
        }
    });

registry.command('prune')
    .description('Remove orphaned files and registry entries')
    .option('--dry-run', 'Show what would be deleted without actually deleting', false)
    .option('--force', 'Delete without confirmation', false)
    .action((opts) => {
        const reg = getRegistry();
        const artifacts = reg.listAll();
        
        console.log(chalk.bold(`\nRegistry Prune (${opts.dryRun ? 'Dry Run' : 'Live'})`));
        console.log('='.repeat(40));

        const artifactDirs = ['data/artifacts/gemini', 'data/artifacts/notebooklm', 'data/audio'];
        let deletedCount = 0;
        
        const registeredPaths = new Set(
            Object.values(artifacts)
                .map(a => a.markdownPath || a.localPath)
                .filter(Boolean)
                .map(p => path.resolve(p!))
        );

        artifactDirs.forEach(dir => {
            const fullDir = path.join(process.cwd(), dir);
            if (!fs.existsSync(fullDir)) return;

            const files = fs.readdirSync(fullDir, { recursive: true }) as string[];
            files.forEach(file => {
                const fullPath = path.join(fullDir, file);
                if (fs.statSync(fullPath).isDirectory()) return;
                
                if (!registeredPaths.has(path.resolve(fullPath))) {
                    console.log(`${chalk.red('[DELETE]')} ${fullPath}`);
                    if (!opts.dryRun) {
                        fs.unlinkSync(fullPath);
                    }
                    deletedCount++;
                }
            });
        });

        console.log(chalk.bold('\nSummary'));
        console.log('-'.repeat(20));
        console.log(`Files ${opts.dryRun ? 'to be deleted' : 'deleted'}: ${chalk.green(deletedCount)}`);
    });

registry.command('show <id>')
    .description('Show artifact details')
    .action((id) => {
        const reg = getRegistry();
        const artifact = reg.get(id);
        if (artifact) {
            console.log(JSON.stringify(artifact, null, 2));
        } else {
            console.log(chalk.red('Artifact not found:', id));
        }
    });

registry.command('lineage <id>')
    .description('Show artifact lineage')
    .action((id) => {
        const registry = getRegistry();
        const lineage = registry.getLineage(id);

        if (lineage.length === 0) {
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
