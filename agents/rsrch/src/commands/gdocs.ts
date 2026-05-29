import { Command } from 'commander';
import { sendServerRequest } from '../cli/utils';
import chalk from 'chalk';

const gdocs = new Command('gdocs').description('Google Docs management commands');

gdocs.command('create <title>')
    .description('Create a new Google Doc')
    .action(async (title) => {
        console.log(chalk.yellow(`Creating GDoc: ${title}...`));
        const data = await sendServerRequest('/gdocs/create', { title });
        if (data?.success) {
            console.log(chalk.green(`✅ Created: ${data.data.url}`));
        } else {
            console.error(chalk.red(`Failed to create: ${data?.error || 'Unknown error'}`));
        }
    });

gdocs.command('tabs <docUrl>')
    .description('List tabs in a GDoc')
    .action(async (docUrl) => {
        const data = await sendServerRequest('/gdocs/tabs/list', { docUrl });
        if (data?.success) {
            console.log(chalk.bold(`\n--- Tabs in Document ---`));
            data.data.forEach((name: string, i: number) => {
                console.log(chalk.cyan(`  ${i + 1}. ${name}`));
            });
            console.log(chalk.bold('------------------------\n'));
        } else {
            console.error(chalk.red(`Failed to list tabs: ${data?.error || 'Unknown error'}`));
        }
    });

gdocs.command('add-tab <docUrl> <tabName>')
    .description('Add a new tab to a GDoc')
    .option('--parent <name>', 'Parent tab name for subtab')
    .action(async (docUrl, tabName, opts) => {
        const path = opts.parent ? '/gdocs/tabs/add-subtab' : '/gdocs/tabs/add';
        const body = opts.parent 
            ? { docUrl, parentTabName: opts.parent, subtabName: tabName }
            : { docUrl, tabName };
            
        console.log(chalk.yellow(`Adding tab "${tabName}"...`));
        const data = await sendServerRequest(path, body);
        if (data?.success) {
            console.log(chalk.green(`✅ Tab added successfully.`));
        } else {
            console.error(chalk.red(`Failed to add tab: ${data?.error || 'Unknown error'}`));
        }
    });

gdocs.command('write <docUrl> <content>')
    .description('Write content to active tab of a GDoc')
    .option('--tab <name>', 'Switch to specific tab before writing')
    .option('--append', 'Append instead of overwrite')
    .action(async (docUrl, content, opts) => {
        console.log(chalk.yellow(`Writing to GDoc...`));
        const data = await sendServerRequest('/gdocs/write', {
            docUrl,
            content,
            tabName: opts.tab,
            append: opts.append
        });
        if (data?.success) {
            console.log(chalk.green(`✅ Content written successfully.`));
        } else {
            console.error(chalk.red(`Failed to write: ${data?.error || 'Unknown error'}`));
        }
    });

export const gdocsCommand = gdocs;
export default gdocsCommand;