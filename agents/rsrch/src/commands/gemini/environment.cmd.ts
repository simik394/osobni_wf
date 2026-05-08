import { Command } from 'commander';
import { 
    runLocalGeminiAction, 
    getOptionsWithGlobals 
} from '../../cli/utils';

export function registerEnvironmentCommands(gemini: Command) {
    const env = gemini.command('env').description('Gemini environment and settings controls');

    env.command('deep-research <on|off>')
        .description('Toggle Deep Research mode')
        .option('--local', 'Use local execution', true)
        .action(async (state) => {
            const enabled = state === 'on';
            await runLocalGeminiAction(async (client, gemini) => {
                const success = await gemini.toggleDeepResearch(enabled);
                if (success) console.log(`Deep Research turned ${state.toUpperCase()}.`);
            });
        });

    env.command('extensions')
        .description('List available extensions and their status')
        .option('--local', 'Use local execution', true)
        .action(async () => {
            await runLocalGeminiAction(async (client, gemini) => {
                const extensions = await gemini.listExtensions();
                console.log('\n--- Gemini Extensions ---');
                if (extensions.length === 0) {
                    console.log('No extensions found.');
                } else {
                    extensions.forEach(ext => {
                        const status = ext.enabled ? '✅ ON ' : '❌ OFF';
                        console.log(`${status} ${ext.name.padEnd(25)} ${ext.description || ''}`);
                    });
                }
                console.log('-------------------------\n');
            });
        });

    env.command('toggle-extension <name> <on|off>')
        .description('Toggle a specific extension')
        .option('--local', 'Use local execution', true)
        .action(async (name, state) => {
            const enabled = state === 'on';
            await runLocalGeminiAction(async (client, gemini) => {
                const success = await gemini.toggleExtension(name, enabled);
                if (success) console.log(`Extension "${name}" turned ${state.toUpperCase()}.`);
            });
        });
}
