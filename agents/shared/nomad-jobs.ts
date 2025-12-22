/**
 * Nomad Job Manager
 * 
 * Utilities for managing Nomad jobs from Windmill scripts.
 * Allows starting/stopping browser containers on-demand.
 */

// Default Nomad configuration
const NOMAD_ADDR = process.env.NOMAD_ADDR || 'http://nomad.service.consul:4646';
const NOMAD_TOKEN = process.env.NOMAD_TOKEN || '';

// Job names for browser containers
export const JOBS = {
    rsrch: 'rsrch-browser',
    angrav: 'angrav-browser',
} as const;

export type AgentType = keyof typeof JOBS;

interface JobStatus {
    status: 'running' | 'pending' | 'dead' | 'unknown';
    allocations: number;
    healthy: boolean;
}

interface NomadHeaders {
    'Content-Type': string;
    'X-Nomad-Token'?: string;
}

function getHeaders(): NomadHeaders {
    const headers: NomadHeaders = { 'Content-Type': 'application/json' };
    if (NOMAD_TOKEN) {
        headers['X-Nomad-Token'] = NOMAD_TOKEN;
    }
    return headers;
}

/**
 * Get the status of a Nomad job
 */
export async function getJobStatus(agent: AgentType): Promise<JobStatus> {
    const jobName = JOBS[agent];

    try {
        const response = await fetch(`${NOMAD_ADDR}/v1/job/${jobName}`, {
            headers: getHeaders()
        });

        if (response.status === 404) {
            return { status: 'dead', allocations: 0, healthy: false };
        }

        if (!response.ok) {
            throw new Error(`Nomad API error: ${response.status}`);
        }

        const job = await response.json();

        // Get allocations to check health
        const allocResponse = await fetch(`${NOMAD_ADDR}/v1/job/${jobName}/allocations`, {
            headers: getHeaders()
        });

        const allocations = await allocResponse.json();
        const runningAllocs = allocations.filter((a: any) => a.ClientStatus === 'running');
        const healthyAllocs = runningAllocs.filter((a: any) =>
            a.DeploymentStatus?.Healthy === true
        );

        return {
            status: job.Status === 'running' ? 'running' :
                job.Status === 'pending' ? 'pending' : 'dead',
            allocations: runningAllocs.length,
            healthy: healthyAllocs.length > 0 || runningAllocs.length > 0
        };

    } catch (error: any) {
        console.error(`Failed to get job status for ${jobName}:`, error.message);
        return { status: 'unknown', allocations: 0, healthy: false };
    }
}

/**
 * Start a Nomad job (if not already running)
 */
export async function startJob(agent: AgentType): Promise<{ success: boolean; message: string }> {
    const jobName = JOBS[agent];

    // Check current status
    const status = await getJobStatus(agent);

    if (status.status === 'running' && status.healthy) {
        return { success: true, message: `Job ${jobName} is already running` };
    }

    try {
        // Fetch the job spec
        const jobResponse = await fetch(`${NOMAD_ADDR}/v1/job/${jobName}`, {
            headers: getHeaders()
        });

        if (jobResponse.status === 404) {
            return {
                success: false,
                message: `Job ${jobName} not found. You need to register it first via Ansible or nomad job run.`
            };
        }

        const job = await jobResponse.json();

        // Re-run the job (this scales it back up if stopped)
        const runResponse = await fetch(`${NOMAD_ADDR}/v1/job/${jobName}`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ Job: job })
        });

        if (!runResponse.ok) {
            const error = await runResponse.text();
            throw new Error(`Failed to start job: ${error}`);
        }

        console.log(`✅ Started job ${jobName}`);
        return { success: true, message: `Job ${jobName} started` };

    } catch (error: any) {
        console.error(`Failed to start job ${jobName}:`, error.message);
        return { success: false, message: error.message };
    }
}

/**
 * Stop a Nomad job (set count to 0, keeps job registered)
 */
export async function stopJob(agent: AgentType): Promise<{ success: boolean; message: string }> {
    const jobName = JOBS[agent];

    try {
        const response = await fetch(`${NOMAD_ADDR}/v1/job/${jobName}`, {
            method: 'DELETE',
            headers: getHeaders()
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Failed to stop job: ${error}`);
        }

        console.log(`🛑 Stopped job ${jobName}`);
        return { success: true, message: `Job ${jobName} stopped` };

    } catch (error: any) {
        console.error(`Failed to stop job ${jobName}:`, error.message);
        return { success: false, message: error.message };
    }
}

/**
 * Wait for a job to become healthy (for on-demand startup)
 */
export async function waitForJob(
    agent: AgentType,
    timeoutMs: number = 60000,
    pollIntervalMs: number = 2000
): Promise<boolean> {
    const jobName = JOBS[agent];
    const startTime = Date.now();

    console.log(`⏳ Waiting for job ${jobName} to become healthy...`);

    while (Date.now() - startTime < timeoutMs) {
        const status = await getJobStatus(agent);

        if (status.healthy) {
            console.log(`✅ Job ${jobName} is healthy`);
            return true;
        }

        if (status.status === 'dead') {
            console.error(`❌ Job ${jobName} is dead`);
            return false;
        }

        await new Promise(r => setTimeout(r, pollIntervalMs));
    }

    console.error(`⏰ Timeout waiting for job ${jobName}`);
    return false;
}

/**
 * Get the service address for a job (via Consul or Nomad allocations)
 */
export async function getServiceAddress(agent: AgentType): Promise<string | null> {
    const jobName = JOBS[agent];

    try {
        // Try Consul first
        const consulAddr = process.env.CONSUL_ADDR || 'http://consul.service.consul:8500';
        const consulResponse = await fetch(`${consulAddr}/v1/health/service/${jobName}?passing=true`);

        if (consulResponse.ok) {
            const services = await consulResponse.json();
            if (services.length > 0) {
                const svc = services[0].Service;
                return `${svc.Address}:${svc.Port}`;
            }
        }

        // Fallback: get from Nomad allocation
        const allocResponse = await fetch(`${NOMAD_ADDR}/v1/job/${jobName}/allocations`, {
            headers: getHeaders()
        });

        if (!allocResponse.ok) {
            return null;
        }

        const allocations = await allocResponse.json();
        const runningAlloc = allocations.find((a: any) => a.ClientStatus === 'running');

        if (!runningAlloc) {
            return null;
        }

        // Get allocation details for network info
        const detailResponse = await fetch(`${NOMAD_ADDR}/v1/allocation/${runningAlloc.ID}`, {
            headers: getHeaders()
        });

        if (!detailResponse.ok) {
            return null;
        }

        const detail = await detailResponse.json();
        const network = detail.AllocatedResources?.Shared?.Networks?.[0];

        if (network) {
            // Find the CDP port
            const cdpPort = network.DynamicPorts?.find((p: any) => p.Label === 'cdp');
            if (cdpPort) {
                return `${network.IP}:${cdpPort.Value}`;
            }
        }

        return null;

    } catch (error: any) {
        console.error(`Failed to get service address for ${jobName}:`, error.message);
        return null;
    }
}

/**
 * Ensure a browser job is running before using it.
 * Starts the job if needed and waits for it to be healthy.
 */
export async function ensureBrowserRunning(
    agent: AgentType,
    startTimeoutMs: number = 90000
): Promise<{ address: string; wasStarted: boolean }> {

    // Check if already running
    let status = await getJobStatus(agent);
    let wasStarted = false;

    if (!status.healthy) {
        console.log(`🚀 Browser for ${agent} not running, starting...`);
        const result = await startJob(agent);

        if (!result.success) {
            throw new Error(`Failed to start browser: ${result.message}`);
        }

        wasStarted = true;

        // Wait for it to become healthy
        const healthy = await waitForJob(agent, startTimeoutMs);
        if (!healthy) {
            throw new Error(`Browser job ${JOBS[agent]} failed to become healthy`);
        }
    }

    // Get the service address
    const address = await getServiceAddress(agent);

    if (!address) {
        throw new Error(`Could not determine address for browser job ${JOBS[agent]}`);
    }

    return { address, wasStarted };
}
