import { Command } from 'commander';
import { sendServerRequest } from '../../cli/utils';

export function registerEnvironmentCommands(gemini: Command) {
    const env = gemini.command('env').description('Gemini environment and settings controls');

    env.command('deep-research <on|off>')
        .description('Toggle Deep Research mode')
        .action(async (state) => {
            const enabled = state === 'on';
            const data = await sendServerRequest('/environment/deep-research', { enabled });
            if (data?.success) console.log(`Deep Research turned ${state.toUpperCase()}.`);
        });

    env.command('extensions')
        .description('List available extensions and their status')
        .action(async () => {
            const data = await sendServerRequest('/environment/extensions');
            if (data?.success) {
                console.log('\n--- Gemini Extensions ---');
                if (data.data.length === 0) {
                    console.log('No extensions found.');
                } else {
                    data.data.forEach((ext: any) => {
                        const status = ext.enabled ? '✅ ON ' : '❌ OFF';
                        console.log(`${status} ${ext.name.padEnd(25)} ${ext.description || ''}`);
                    });
                }
                console.log('-------------------------\n');
            }
        });

    env.command('toggle-extension <name> <on|off>')
        .description('Toggle a specific extension')
        .action(async (name, state) => {
            const enabled = state === 'on';
            const data = await sendServerRequest('/environment/toggle-extension', { name, enabled });
            if (data?.success) console.log(`Extension "${name}" turned ${state.toUpperCase()}.`);
        });

    env.command('set-model <model>')
        .description('Set the active Gemini model (flash, pro, thinking, advanced)')
        .action(async (model) => {
            console.log(`[CLI] Setting Gemini model to: ${model}...`);
            const data = await sendServerRequest('/environment/set-model', { model });
            if (data?.success) console.log(`✅ Model successfully set to ${model}.`);
            else console.error(`❌ Failed to set model to ${model}.`);
        });
}
