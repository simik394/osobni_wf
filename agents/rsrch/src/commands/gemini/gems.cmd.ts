import { Command } from 'commander';
import { sendServerRequest } from '../../cli/utils';

export function registerGemCommands(gemini: Command) {
    const gems = gemini.command('gems').description('Manage Gemini Gems (custom agents)');

    gems.command('list')
        .description('List all available Gems')
        .action(async () => {
            const data = await sendServerRequest('/gems');
            if (data?.success) {
                console.log('\n--- Available Gems ---');
                if (data.data.length === 0) {
                    console.log('No Gems found.');
                } else {
                    data.data.forEach((g: any) => {
                        console.log(`${g.name.padEnd(25)} (ID: ${g.id})`);
                    });
                }
                console.log('----------------------\n');
            }
        });

    gems.command('create <name> <instructions>')
        .description('Create a new Gem')
        .action(async (name, instructions) => {
            const data = await sendServerRequest('/gems/create', { name, instructions });
            if (data?.success) console.log(`Gem created successfully: ${name} (ID: ${data.id})`);
        });

    gems.command('update <id>')
        .description('Update an existing Gem')
        .option('-n, --name <string>', 'New name')
        .option('-i, --instructions <string>', 'New instructions')
        .action(async (id, opts) => {
            const data = await sendServerRequest('/gems/update', { id, name: opts.name, instructions: opts.instructions });
            if (data?.success) console.log(`Gem ${id} updated successfully.`);
            else console.error(`Failed to update Gem ${id}.`);
        });

    gems.command('delete <id>')
        .description('Delete a Gem')
        .action(async (id) => {
            const data = await sendServerRequest('/gems/delete', { id });
            if (data?.success) console.log(`Gem ${id} deleted.`);
            else console.error(`Failed to delete Gem ${id}.`);
        });

    gems.command('chat <nameOrId> <message>')
        .description('Start a chat with a specific Gem')
        .action(async (nameOrId, message) => {
            const data = await sendServerRequest('/gems/chat', { nameOrId, message });
            if (data?.success) {
                console.log('\n--- Response from Gem ---');
                console.log(data.data);
                console.log('-------------------------\n');
            }
        });
}
