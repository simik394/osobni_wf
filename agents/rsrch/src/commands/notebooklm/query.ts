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
}
