/**
 * Windmill Script: Submit Rsrch Query (Non-blocking)
 *
 * This script enqueues a research query and returns immediately with a job_id.
 * The caller can use the job_id to poll for results.
 *
 * Usage in Windmill:
 *   const { job_id } = await submit({ query: "Latest advancements in..." });
 *   // Later...
 *   const result = await poll({ job_id });
 */

export async function main(
    query: string,
    deep_research: boolean = false,
    session_id?: string,
    worker_tag?: string  // Optional: specify worker group (e.g., 'server', 'ntb-local')
): Promise<{ job_id: string; status: string }> {

    // @ts-ignore - Windmill provides this globally
    const wmill = await import('windmill-client');

    // Build the job options
    const jobOptions: any = {
        path: 'f/rsrch/execute',
        args: {
            query,
            deep_research,
            session_id
        }
    };

    // Only add tag if specified (otherwise uses default worker group)
    if (worker_tag) {
        jobOptions.tag = worker_tag;
    }

    // Run the execute script asynchronously
    const jobId = await wmill.runScriptAsync(jobOptions);

    console.log(`📋 Submitted Rsrch query with job_id: ${jobId}`);

    return {
        job_id: jobId,
        status: 'queued'
    };
}

