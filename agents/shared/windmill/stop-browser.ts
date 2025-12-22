/**
 * Windmill Script: Stop Browser Job
 * 
 * Stops the browser container to save resources when not needed.
 */

import { stopJob, getJobStatus, AgentType, JOBS } from '../../shared/nomad-jobs';

export async function main(
    agent: 'rsrch' | 'angrav'
): Promise<{
    success: boolean;
    message: string;
}> {

    // Check current status first
    const status = await getJobStatus(agent as AgentType);

    if (status.status === 'dead' || status.status === 'unknown') {
        return {
            success: true,
            message: `Job ${JOBS[agent as AgentType]} is already stopped`
        };
    }

    return await stopJob(agent as AgentType);
}
