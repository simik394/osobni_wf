/**
 * Nomad Job Manager
 * 
 * Utilities for managing Nomad jobs from Windmill scripts.
 * Allows starting/stopping browser containers on-demand.
 */

declare const process: any;

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

type NomadHeaders = Record<string, string>;

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

        const job = await response.json() as any;

        // Get allocations to check health
        const allocResponse = await fetch(`${NOMAD_ADDR}/v1/job/${jobName}/allocations`, {
            headers: getHeaders()
        });

        const allocations = await allocResponse.json() as any;
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
export async function startJob(agent: AgentType, profile?: string): Promise<{ success: boolean; message: string }> {
    const jobName = JOBS[agent];

    // Check availability only if using default profile, otherwise proceed to patch/restart
    if (!profile || profile === 'default') {
        const status = await getJobStatus(agent);
        if (status.status === 'running' && status.healthy) {
            // We can't easily check *which* profile is running without inspecting, so assume default if running.
            // A more robust check would inspect the running job to see if the volume matches.
            // For now, if user requests a specific profile, we might want to force restart if it's not the current one.
            // BUT, to keep it simple: if running and healthy, we assume it's OK unless we explicitly want to force a switch.
            // Let's rely on the user stopping it if they want to switch, OR we inspect.

            // Let's inspector check:
            try {
                const jobResponse = await fetch(`${NOMAD_ADDR}/v1/job/${jobName}`, { headers: getHeaders() });
                const job = await jobResponse.json() as any;
                const volumes = job.TaskGroups?.[0]?.Tasks?.[0]?.Config?.volumes || [];
                const currentProfile = volumes[0]?.split(':')[0]?.split('/').pop();

                if (currentProfile === 'default') {
                    return { success: true, message: `Job ${jobName} is already running with default profile` };
                }
            } catch (e) {
                // ignore inspect error, proceed to restart logic
            }
        }
    }

    if (profile) {
        // Validate profile name strictly
        if (!/^[a-zA-Z0-9_-]+$/.test(profile)) {
            return { success: false, message: `Invalid profile name: ${profile}. Must be alphanumeric.` };
        }
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

        const job = await jobResponse.json() as any;

        // Patch the volume if profile is requested
        if (profile) {
            // Locate the task config
            const taskGroup = job.TaskGroups?.[0];
            const task = taskGroup?.Tasks?.find((t: any) => t.Name === 'chromium');

            if (task && task.Config && Array.isArray(task.Config.volumes)) {
                // We expect volume format "/opt/rsrch/profiles/XXX:/app/user-data"
                // Pass only the profile name, construct absolute path
                const newVolume = `/opt/rsrch/profiles/${profile}:/app/user-data`;
                task.Config.volumes = [newVolume];
                console.log(`🔧 Patching job ${jobName} to use profile: ${profile}`);
            } else {
                console.warn(`⚠️ Could not find task 'chromium' or volumes config in job ${jobName}. Profile patching may fail.`);
            }
        }

        // Re-run the job (this scales it back up if stopped, and updates definition if patched)
        const runResponse = await fetch(`${NOMAD_ADDR}/v1/job/${jobName}`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ Job: job })
        });

        if (!runResponse.ok) {
            const error = await runResponse.text();
            throw new Error(`Failed to start job: ${error}`);
        }

        console.log(`✅ Started job ${jobName} (Profile: ${profile || 'default'})`);
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
            const services = await consulResponse.json() as any;
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

        const allocations = await allocResponse.json() as any;
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

        const detail = await detailResponse.json() as any;
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
    startTimeoutMs: number = 90000,
    profile?: string
): Promise<{ address: string; wasStarted: boolean }> {

    // Check if already running (and potentially correct profile check logic here if we wanted strictly enforced profiles)
    // For now, startJob handles the profile switch logic (it will restart/update if needed) mechanism

    // We force a "start" call if a profile is requested, to ensure the job definition is updated
    // Simple check: if no profile requested, check health first. 
    // If profile requested, we can't trust simple health check without inspecting (which startJob does now).

    let shouldStart = true;
    if (!profile) {
        const status = await getJobStatus(agent);
        if (status.healthy) {
            shouldStart = false;
        }
    }

    let wasStarted = false;

    if (shouldStart) {
        console.log(`🚀 Ensuring browser for ${agent} is running (Profile: ${profile || 'default'})...`);
        const result = await startJob(agent, profile);

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
