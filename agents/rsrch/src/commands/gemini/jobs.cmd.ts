import { Command } from 'commander';
import { 
    sendServerRequest 
} from '../../cli/utils';

export function registerJobCommands(gemini: Command) {
    gemini.command('job-status <jobId>')
        .description('Get status of an async deep research job')
        .action(async (jobId) => {
            const response = await sendServerRequest(`/deep-research/status/${jobId}`, {});
            console.log(`\n--- Job Status ---`);
            console.log(`ID:      ${response.jobId}`);
            console.log(`Status:  ${response.status}`);
            console.log(`Query:   ${response.query}`);
            if (response.error) console.log(`Error: ${response.error}`);
            console.log('------------------\n');
        });

    gemini.command('job-result <jobId>')
        .description('Get result of a completed async deep research job')
        .action(async (jobId) => {
            const response = await sendServerRequest(`/deep-research/result/${jobId}`, {});
            if (!response.success) {
                console.log(`\n⏳ Job not completed yet. Status: ${response.status}`);
                return;
            }
            console.log(`\n--- Job Result ---`);
            console.log(`ID: ${response.jobId}`);
            console.log(`Result:`, JSON.stringify(response.result, null, 2));
            console.log('------------------\n');
        });
}
