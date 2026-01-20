import { Command } from 'commander';
import * as path from 'path';
import { execSync } from 'child_process';
import { getRegistry } from '../artifact-registry';

const registry = new Command('registry').description('Artifact registry commands');

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

export const registryCommand = registry;
