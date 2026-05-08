import { Command } from 'commander';
import { runLocalGeminiAction } from '../../cli/utils';

export function registerGemCommands(gemini: Command) {
    const gems = gemini.command('gems').description('Manage Gemini Gems (custom agents)');

    gems.command('list')
        .description('List all available Gems')
        .option('--local', 'Use local execution', true)
        .action(async () => {
            await runLocalGeminiAction(async (client, gemini) => {
                const gems = await gemini.listGems();
                console.log('\n--- Available Gems ---');
                if (gems.length === 0) {
                    console.log('No Gems found.');
                } else {
                    gems.forEach(g => {
                        console.log(`${g.name.padEnd(25)} (ID: ${g.id})`);
                    });
                }
                console.log('----------------------\n');
            });
        });

    gems.command('create <name> <instructions>')
        .description('Create a new Gem')
        .option('--local', 'Use local execution', true)
        .action(async (name, instructions) => {
            await runLocalGeminiAction(async (client, gemini) => {
                const id = await gemini.createGem({ name, instructions });
                console.log(`Gem created successfully: ${name} (ID: ${id})`);
            });
        });

    gems.command('update <id>')
        .description('Update an existing Gem')
        .option('-n, --name <string>', 'New name')
        .option('-i, --instructions <string>', 'New instructions')
        .option('--local', 'Use local execution', true)
        .action(async (id, opts) => {
            await runLocalGeminiAction(async (client, gemini) => {
                const success = await gemini.updateGem(id, { 
                    name: opts.name, 
                    instructions: opts.instructions 
                });
                if (success) console.log(`Gem ${id} updated successfully.`);
                else console.error(`Failed to update Gem ${id}.`);
            });
        });

    gems.command('delete <id>')
        .description('Delete a Gem')
        .option('--local', 'Use local execution', true)
        .action(async (id) => {
            await runLocalGeminiAction(async (client, gemini) => {
                const success = await gemini.deleteGem(id);
                if (success) console.log(`Gem ${id} deleted.`);
                else console.error(`Failed to delete Gem ${id}.`);
            });
        });

    gems.command('chat <nameOrId> <message>')
        .description('Start a chat with a specific Gem')
        .option('--local', 'Use local execution', true)
        .action(async (nameOrId, message) => {
            await runLocalGeminiAction(async (client, gemini) => {
                const response = await gemini.chatWithGem(nameOrId, message);
                console.log('\n--- Response from Gem ---');
                console.log(response);
                console.log('-------------------------\n');
            });
        });
}
