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
    session_id?: string
): Promise<{ job_id: string; status: string }> {

    // @ts-ignore - Windmill provides this globally
    const wmill = await import('windmill-client');

    // Run the execute script asynchronously
    const jobId = await wmill.runScriptAsync({
        path: 'f/rsrch/execute',
        args: {
            query,
            deep_research,
            session_id
        },
        // Tag ensures it runs on the NTB worker that has access to rsrch-chromium
        tag: 'ntb-local'
    });

    console.log(`📋 Submitted Rsrch query with job_id: ${jobId}`);

    return {
        job_id: jobId,
        status: 'queued'
    };
}
