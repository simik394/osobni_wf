/**
 * Windmill Proxy Layer
 * 
 * Provides middleware and utilities for routing agent API requests through Windmill.
 * This ensures serialized execution of browser-interacting tasks.
 * 
 * Usage:
 *   import { createWindmillProxyMiddleware } from '@agents/shared';
 *   app.use('/v1/chat/completions', createWindmillProxyMiddleware('rsrch'));
 */

export interface WindmillConfig {
    /** Windmill API base URL */
    baseUrl: string;
    /** Windmill API token (from WINDMILL_TOKEN env) */
    token: string;
    /** Workspace name */
    workspace: string;
    /** Maximum time to wait for job completion (ms) */
    timeout: number;
    /** Poll interval for job status (ms) */
    pollInterval: number;
}

export interface ChatCompletionRequest {
    model: string;
    messages: Array<{ role: string; content: string }>;
    stream?: boolean;
    session?: string;
    [key: string]: any;
}

export interface WindmillJob {
    id: string;
    status: 'queued' | 'running' | 'completed' | 'failed';
    result?: any;
    error?: string;
}

const DEFAULT_CONFIG: WindmillConfig = {
    baseUrl: process.env.WINDMILL_URL || 'http://localhost:8000',
    token: process.env.WINDMILL_TOKEN || '',
    workspace: process.env.WINDMILL_WORKSPACE || 'main',
    timeout: 5 * 60 * 1000, // 5 minutes
    pollInterval: 1000 // 1 second
};

/**
 * Check if request should bypass Windmill proxy
 */
export function shouldBypass(headers: Record<string, string | string[] | undefined>): boolean {
    const bypassHeader = headers['x-bypass-windmill'] || headers['X-Bypass-Windmill'];
    return bypassHeader === 'true' || bypassHeader === '1';
}

/**
 * Create a Windmill job and wait for completion
 */
export async function runWindmillJob(
    scriptPath: string,
    args: Record<string, any>,
    config: Partial<WindmillConfig> = {}
): Promise<any> {
    const cfg = { ...DEFAULT_CONFIG, ...config };

    if (!cfg.token) {
        throw new Error('WINDMILL_TOKEN not configured');
    }

    // Create job
    const createResponse = await fetch(
        `${cfg.baseUrl}/api/w/${cfg.workspace}/jobs/run/p/${scriptPath}`,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${cfg.token}`
            },
            body: JSON.stringify(args)
        }
    );

    if (!createResponse.ok) {
        const errorText = await createResponse.text();
        throw new Error(`Failed to create Windmill job: ${createResponse.status} ${errorText}`);
    }

    const jobId = await createResponse.text();
    console.log(`[WindmillProxy] Created job: ${jobId}`);

    // Poll for completion
    const startTime = Date.now();
    while (Date.now() - startTime < cfg.timeout) {
        const statusResponse = await fetch(
            `${cfg.baseUrl}/api/w/${cfg.workspace}/jobs_u/completed/get_result/${jobId}`,
            {
                headers: {
                    'Authorization': `Bearer ${cfg.token}`
                }
            }
        );

        if (statusResponse.ok) {
            const result = await statusResponse.json();
            console.log(`[WindmillProxy] Job ${jobId} completed`);
            return result;
        }

        if (statusResponse.status === 404) {
            // Job not complete yet, wait and retry
            await new Promise(resolve => setTimeout(resolve, cfg.pollInterval));
            continue;
        }

        // Check if job failed
        const jobInfoResponse = await fetch(
            `${cfg.baseUrl}/api/w/${cfg.workspace}/jobs_u/get/${jobId}`,
            {
                headers: {
                    'Authorization': `Bearer ${cfg.token}`
                }
            }
        );

        if (jobInfoResponse.ok) {
            const jobInfo = await jobInfoResponse.json() as { type?: string; success?: boolean; result?: { error?: string } };
            if (jobInfo.type === 'CompletedJob' && !jobInfo.success) {
                throw new Error(`Windmill job failed: ${jobInfo.result?.error || 'Unknown error'}`);
            }
        }

        await new Promise(resolve => setTimeout(resolve, cfg.pollInterval));
    }

    throw new Error(`Windmill job ${jobId} timed out after ${cfg.timeout}ms`);
}

/**
 * Proxy a chat completion request through Windmill
 */
export async function proxyChatCompletion(
    agentType: 'rsrch' | 'angrav',
    request: ChatCompletionRequest,
    config: Partial<WindmillConfig> = {}
): Promise<any> {
    const scriptPath = `f/agents/${agentType}/chat_completion`;

    console.log(`[WindmillProxy] Proxying to ${scriptPath}`);

    return runWindmillJob(scriptPath, {
        messages: request.messages,
        model: request.model,
        stream: false, // Windmill doesn't support streaming
        session: request.session
    }, config);
}

/**
 * Express/HTTP middleware factory for Windmill proxy
 * 
 * @param agentType The agent type ('rsrch' or 'angrav')
 * @returns Middleware function
 */
export function createWindmillProxyMiddleware(agentType: 'rsrch' | 'angrav') {
    return async (req: any, res: any, next: () => void) => {
        // Check for bypass header
        if (shouldBypass(req.headers)) {
            console.log('[WindmillProxy] Bypass header detected, passing through');
            return next();
        }

        // Check if Windmill is configured
        if (!process.env.WINDMILL_TOKEN) {
            console.warn('[WindmillProxy] WINDMILL_TOKEN not set, passing through');
            return next();
        }

        try {
            const result = await proxyChatCompletion(agentType, req.body);
            res.json(result);
        } catch (error) {
            console.error('[WindmillProxy] Error:', error);
            res.status(500).json({
                error: {
                    message: error instanceof Error ? error.message : 'Windmill proxy error',
                    type: 'windmill_proxy_error'
                }
            });
        }
    };
}

/**
 * Check if Windmill proxy is enabled and configured
 */
export function isWindmillProxyEnabled(): boolean {
    return !!process.env.WINDMILL_TOKEN && !!process.env.WINDMILL_URL;
}
