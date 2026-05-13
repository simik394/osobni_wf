import { Command } from 'commander';
import { sendServerRequest } from '../../cli/utils';
import * as path from 'path';
import * as fs from 'fs';
import chalk from 'chalk';

export function registerContentCommands(notebook: Command) {
    notebook.command('preview <notebookTitle>')
        .description('Preview content (sources, studio, or chat) from a notebook')
        .requiredOption('-t, --type <type>', 'Type of content to list (sources, studio, chat)')
        .action(async (notebookTitle, opts) => {
            const response = await sendServerRequest('/notebook/content-preview', { notebookTitle, type: opts.type });
            if (response && response.data) {
                const type = opts.type.toLowerCase();
                if (type === 'sources') {
                    console.log(chalk.bold(`\n📚 Found ${response.data.length} sources:\n`));
                    response.data.forEach((s: any, idx: number) => {
                        console.log(chalk.cyan(`[${idx + 1}] ${s.title}`));
                        console.log(chalk.dim(`${s.contentSnippet.replace(/\n/g, ' ')}\n`));
                    });
                } else if (type === 'studio') {
                    console.log(chalk.bold(`\n🎨 Found ${response.data.length} artifacts:\n`));
                    response.data.forEach((a: any, idx: number) => {
                        console.log(chalk.cyan(`[${idx + 1}] ${a.title} (${a.type})`));
                    });
                } else if (type === 'chat') {
                    console.log(chalk.bold(`\n💬 Found ${response.data.length} chat pairs:\n`));
                    response.data.forEach((h: any, idx: number) => {
                        const q = h.query.length > 80 ? h.query.substring(0, 80) + '...' : h.query;
                        const r = h.response.length > 80 ? h.response.substring(0, 80) + '...' : h.response;
                        console.log(chalk.cyan(`[${idx + 1}] Q: ${q.replace(/\n/g, ' ')}`));
                        console.log(chalk.dim(`    A: ${r.replace(/\n/g, ' ')}\n`));
                    });
                }
            }
        });

    notebook.command('get <notebookTitle>')
        .description('Download content (sources, studio, or chat) from a notebook')
        .requiredOption('-t, --type <type>', 'Type of content to download (sources, studio, chat)')
        .option('-i, --items <items>', 'Comma-separated indices of items to download (e.g. 1,3,5)')
        .option('-o, --output <dir>', 'Custom output directory')
        .action(async (notebookTitle, opts) => {
            const type = opts.type.toLowerCase();
            const indices = opts.items ? opts.items.split(',').map((n: string) => parseInt(n.trim(), 10)) : undefined;
            const outputDir = opts.output ? path.resolve(process.cwd(), opts.output) : path.join(process.cwd(), 'data/artifacts/notebooklm', notebookTitle.replace(/[^a-z0-9]/gi, '_'));

            if (!fs.existsSync(outputDir)) {
                fs.mkdirSync(outputDir, { recursive: true });
            }

            console.log(`[CLI] Requesting download via server...`);
            if (type === 'chat') {
                const response = await sendServerRequest('/notebook/content-preview', { notebookTitle, type: 'chat' });
                if (response && response.data) {
                    let chatMd = '# Chat History\n\n';
                    response.data.forEach((h: any, idx: number) => {
                        if (indices && !indices.includes(idx + 1)) return;
                        chatMd += `## Query ${idx + 1}\n**User:** ${h.query}\n\n**AI:** ${h.response}\n\n---\n\n`;
                    });
                    const fp = path.join(outputDir, 'chat_history.md');
                    fs.writeFileSync(fp, chatMd);
                    console.log(`[CLI] Saved chat history locally to ${fp}`);
                }
            } else {
                await sendServerRequest('/notebook/content-download', {
                    notebookTitle,
                    type,
                    indices,
                    outputDir
                });
                console.log(`✅ Server reported success. Files should be in ${outputDir} (on the server).`);
            }
        });
}
