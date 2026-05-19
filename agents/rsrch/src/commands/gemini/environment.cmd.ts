import { Command } from 'commander';
import { sendServerRequest } from '../../cli/utils';

export function registerEnvironmentCommands(gemini: Command) {
    const env = gemini.command('env').description('Gemini environment and settings controls');

    env.command('deep-research <on|off>')
        .description('Toggle Deep Research mode')
        .action(async (state) => {
            const enabled = state === 'on';
            const data = await sendServerRequest('/gemini/environment/deep-research', { enabled }, 'POST');
            if (data?.success) console.log(`Deep Research turned ${state.toUpperCase()}.`);
        });

    env.command('extensions')
        .description('List available extensions and their status')
        .action(async () => {
            const data = await sendServerRequest('/gemini/environment/extensions', {}, 'GET');
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
            const data = await sendServerRequest('/gemini/environment/toggle-extension', { name, enabled }, 'POST');
            if (data?.success) console.log(`Extension "${name}" turned ${state.toUpperCase()}.`);
        });

    env.command('set-model <model>')
        .description('Set the active Gemini model (flash-lite, 2.5-flash, 3.1-pro, advanced, standard/extended thinking levels)')
        .action(async (model) => {
            console.log(`[CLI] Setting Gemini model/thinking config to: ${model}...`);
            const data = await sendServerRequest('/gemini/environment/set-model', { model }, 'POST');
            if (data?.success) console.log(`✅ Model successfully set to ${model}.`);
            else console.error(`❌ Failed to set model config to ${model}.`);
        });

    env.command('model-status')
        .description('Get the current availability and rate limit status of all Gemini models')
        .action(async () => {
            const data = await sendServerRequest('/gemini/environment/model-status', {}, 'GET');
            if (data?.success) {
                console.log('\n=================================== GEMINI MODEL STATUS ===================================');
                if (!data.data || data.data.length === 0) {
                    console.log('No model statuses retrieved from server.');
                } else {
                    console.log(`${'MODEL ID'.padEnd(12)} | ${'MODEL NAME'.padEnd(20)} | ${'STATUS'.padEnd(10)} | ${'RESET DATE/TIME'.padEnd(20)} | ${'DETAILS'}`);
                    console.log('-'.repeat(91));
                    data.data.forEach((m: any) => {
                        const status = m.isLimited ? '❌ LIMITED' : '✅ ACTIVE';
                        const resetVal = m.resetTime || 'N/A';
                        const detail = m.info || '';
                        console.log(`${m.id.padEnd(12)} | ${m.name.padEnd(20)} | ${status.padEnd(10)} | ${resetVal.padEnd(20)} | ${detail}`);
                    });
                }
                console.log('===========================================================================================\n');
            } else {
                console.error('❌ Failed to retrieve model status from server.');
            }
        });
}
