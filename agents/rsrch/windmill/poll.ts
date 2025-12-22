/**
 * Windmill Script: Poll Rsrch Query Result
 *
 * Check the status of a previously submitted query and retrieve results when ready.
 */

export async function main(
    job_id: string
): Promise<{
    status: 'queued' | 'running' | 'completed' | 'failed';
    result?: any;
    error?: string;
}> {

    // @ts-ignore - Windmill provides this globally
    const wmill = await import('windmill-client');

    try {
        const job = await wmill.getJob(job_id);

        if (!job) {
            return { status: 'failed', error: `Job ${job_id} not found` };
        }

        switch (job.type) {
            case 'QueuedJob':
                return { status: 'queued' };
            case 'RunningJob':
                return { status: 'running' };
            case 'CompletedJob':
                if (job.success) {
                    return { status: 'completed', result: job.result };
                } else {
                    return { status: 'failed', error: job.result?.error || 'Unknown error' };
                }
            default:
                return { status: 'failed', error: `Unknown job state: ${job.type}` };
        }

    } catch (error: any) {
        console.error(`Error polling job ${job_id}:`, error);
        return { status: 'failed', error: error.message };
    }
}
