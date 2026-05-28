import { Command } from 'commander';
import { sendServerRequest } from '../../cli/utils';

export function registerQueryCommands(notebook: Command) {
    notebook.command('messages <title>')
        .description('Get notebook chat messages')
        .action(async (title) => {
            const data = await sendServerRequest('/notebook/messages', { title });
            if (data?.success) {
                console.log(JSON.stringify(data.data, null, 2));
            } else {
                console.log(JSON.stringify(data, null, 2));
            }
        });

    notebook.command('ask <title> <message>')
        .description('Ask a question to a notebook')
        .option('-s, --sources <names>', 'Specific sources to use (comma-separated names or range like 1,3-5)')
        .action(async (title, message, opts) => {
            console.log(`[CLI] Asking notebook "${title}": ${message}...`);
            const sources = opts.sources ? opts.sources.split(',').map((s: string) => s.trim()) : undefined;
            const data = await sendServerRequest('/notebook/ask', { title, message, sources });
            if (data?.success) {
                console.log('\n--- NotebookLM Response ---\n');
                console.log(data.data);
                console.log('\n---------------------------\n');
            } else {
                console.error('❌ Failed to get response from NotebookLM');
                console.log(JSON.stringify(data, null, 2));
            }
        });
}
