import { Command } from 'commander';
import { runLocalNotebookAction, sendServerRequest } from '../../cli/utils';
import { cliContext } from '../../cli/context';

export function registerQueryCommands(notebook: Command) {
    notebook.command('messages <title>')
        .description('Get notebook chat messages')
        .option('--local', 'Use local execution', false)
        .action(async (title, opts) => {
            if (opts.local || cliContext.get().local) {
                await runLocalNotebookAction(async (client, nb) => {
                    await nb.openNotebook(title);
                    const messages = await nb.getChatMessages();
                    console.log(JSON.stringify(messages, null, 2));
                });
            } else {
                await sendServerRequest('/notebook/messages', { title });
            }
        });
}
