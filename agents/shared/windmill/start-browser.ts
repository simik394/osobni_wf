/**
 * Windmill Script: Start Browser Job
 * 
 * Starts the browser container via Nomad and waits for it to be healthy.
 * Use this before running automation that needs the browser.
 */

import { ensureBrowserRunning, getJobStatus, AgentType } from '../../shared/nomad-jobs';

export async function main(
    agent: 'rsrch' | 'angrav',
    timeout_seconds: number = 90
): Promise<{
    success: boolean;
    address: string;
    wasStarted: boolean;
    status: string;
}> {

    try {
        const result = await ensureBrowserRunning(
            agent as AgentType,
            timeout_seconds * 1000
        );

        const status = await getJobStatus(agent as AgentType);

        return {
            success: true,
            address: result.address,
            wasStarted: result.wasStarted,
            status: status.status
        };

    } catch (error: any) {
        return {
            success: false,
            address: '',
            wasStarted: false,
            status: error.message
        };
    }
}
