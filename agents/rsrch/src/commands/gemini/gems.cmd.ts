import { Command } from 'commander';
import { 
    runLocalGeminiAction, 
    executeGeminiGet, 
    executeGeminiCommand, 
    getOptionsWithGlobals 
} from '../../cli/utils';
import { cliContext } from '../../cli/context';

export function registerGemCommands(gemini: Command) {
    gemini.command('list-gems')
        .description('List available Gems')
        .option('--local', 'Use local execution', false)
        .action(async (opts, cmd) => {
            const globalOpts = getOptionsWithGlobals(cmd);
            const { serverUrl } = cliContext.get();

            if (globalOpts.local) {
                await runLocalGeminiAction(async (client, gemini) => {
                    const gems = await gemini.listGems();
                    console.log('\n--- Available Gems ---');
                    gems.forEach((gem: any) => console.log(`- ${gem.name} (ID: ${gem.id})`));
                    console.log('----------------------\n');
                });
                return;
            }

            try {
                const result = await executeGeminiGet('gems', {}, { server: serverUrl });
                const gems = result.data || [];
                console.log('\n--- Available Gems ---');
                gems.forEach((gem: any) => console.log(`- ${gem.name} (ID: ${gem.id})`));
                console.log('----------------------\n');
            } catch (e: any) {
                console.error(`[CLI] Error: ${e.message}`);
                process.exit(1);
            }
        });

    gemini.command('open-gem <gemNameOrId>')
        .description('Open a Gem')
        .option('--local', 'Use local execution', true)
        .action(async (gemNameOrId, opts, cmd) => {
            const globalOpts = getOptionsWithGlobals(cmd);
            const { serverUrl } = cliContext.get();

            if (globalOpts.local) {
                await runLocalGeminiAction(async (client, gemini) => {
                    const success = await gemini.openGem(gemNameOrId);
                    if (success) console.log(`\n✅ Opened gem: ${gemNameOrId}`);
                    else console.log(`\n❌ Failed to open gem: ${gemNameOrId}`);
                });
                return;
            }

            try {
                await executeGeminiCommand('open-gem', { gemNameOrId }, { server: serverUrl });
                console.log(`\n✅ Opened gem: ${gemNameOrId} (on server)`);
            } catch (e: any) {
                console.error(`[CLI] Error: ${e.message}`);
                process.exit(1);
            }
        });

    gemini.command('create-gem <name>')
        .description('Create a new Gem')
        .requiredOption('--instructions <text>', 'System instructions')
        .option('--file <paths...>', 'Files to upload')
        .option('--config <path>', 'Config file')
        .option('--local', 'Use local execution', true)
        .action(async (name, opts) => {
            let gemName = name;
            let instructions = opts.instructions;
            let files = opts.file || [];

            if (opts.config) {
                try {
                    const { loadGemConfig } = require('../../core/gem-loader');
                    const config = loadGemConfig(opts.config);
                    if (!gemName || gemName === 'default') gemName = config.name;
                    if (!instructions) instructions = config.instructions;
                    if (config.files) files.push(...config.files);
                } catch (e: any) {
                    console.error(`Error loading config: ${e.message}`);
                    process.exit(1);
                }
            }

            await runLocalGeminiAction(async (client, gemini) => {
                const gemId = await gemini.createGem({
                    name: gemName,
                    instructions,
                    files: files.length > 0 ? files : undefined,
                });
                if (gemId) console.log(`\n✅ Created gem: ${gemName} (ID: ${gemId})`);
                else console.log(`\n⚠️ Gem created but ID unknown: ${gemName}`);
            });
        });

    gemini.command('update-gem <gemId>')
        .description('Update an existing Gem')
        .option('--name <text>', 'New name')
        .option('--instructions <text>', 'New system instructions')
        .option('--file <paths...>', 'Files to upload')
        .option('--config <path>', 'Config file')
        .option('--local', 'Use local execution', true)
        .action(async (gemId, opts) => {
            let name = opts.name;
            let instructions = opts.instructions;
            let files = opts.file || [];

            if (opts.config) {
                try {
                    const { loadGemConfig } = require('../../core/gem-loader');
                    const config = loadGemConfig(opts.config);
                    if (!name) name = config.name;
                    if (!instructions) instructions = config.instructions;
                    if (config.files) files.push(...config.files);
                } catch (e: any) {
                    console.error(`Error loading config: ${e.message}`);
                    process.exit(1);
                }
            }

            await runLocalGeminiAction(async (client, gemini) => {
                const success = await gemini.updateGem(gemId, {
                    name,
                    instructions,
                    files: files.length > 0 ? files : undefined,
                });
                if (success) console.log(`\n✅ Updated gem: ${gemId}`);
                else console.log(`\n⚠️ Failed to update gem: ${gemId}`);
            });
        });

    gemini.command('delete-gem <gemId>')
        .description('Delete an existing Gem')
        .option('--local', 'Use local execution', true)
        .action(async (gemId) => {
            await runLocalGeminiAction(async (client, gemini) => {
                const success = await gemini.deleteGem(gemId);
                if (success) console.log(`\n✅ Deleted gem: ${gemId}`);
                else console.log(`\n⚠️ Failed to delete gem: ${gemId}`);
            });
        });

    gemini.command('chat-gem <gemNameOrId> <message>')
        .description('Chat with a Gem')
        .option('--local', 'Use local execution', true)
        .action(async (gemNameOrId, message, opts, cmd) => {
            const globalOpts = getOptionsWithGlobals(cmd);
            const { serverUrl } = cliContext.get();

            if (globalOpts.local) {
                await runLocalGeminiAction(async (client, gemini) => {
                    const response = await gemini.chatWithGem(gemNameOrId, message);
                    console.log('\n--- Response ---');
                    if (response) console.log(response);
                    else console.log('No response received');
                    console.log('----------------\n');
                });
                return;
            }

            try {
                const result = await executeGeminiCommand('chat-gem', { gemNameOrId, message }, { server: serverUrl });
                console.log('\n--- Response ---');
                console.log(result.data?.response || result.response || 'No response data');
                console.log('----------------\n');
            } catch (e: any) {
                console.error(`[CLI] Error: ${e.message}`);
                process.exit(1);
            }
        });
}
