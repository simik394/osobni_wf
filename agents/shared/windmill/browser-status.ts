/**
 * Windmill Script: Browser Status
 * 
 * Get the status of browser containers managed by Nomad.
 */

import { getJobStatus, getServiceAddress, AgentType, JOBS } from '../../shared/nomad-jobs';

export async function main(
    agent?: 'rsrch' | 'angrav' | 'all'
): Promise<{
    rsrch?: { status: string; healthy: boolean; address: string | null };
    angrav?: { status: string; healthy: boolean; address: string | null };
}> {

    const agents = agent === 'all' || !agent
        ? ['rsrch', 'angrav']
        : [agent];

    const result: any = {};

    for (const a of agents) {
        const status = await getJobStatus(a as AgentType);
        const address = status.healthy
            ? await getServiceAddress(a as AgentType)
            : null;

        result[a] = {
            status: status.status,
            healthy: status.healthy,
            address: address
        };
    }

    return result;
}
