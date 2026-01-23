"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.shouldBypass = shouldBypass;
exports.runWindmillJob = runWindmillJob;
exports.proxyChatCompletion = proxyChatCompletion;
exports.createWindmillProxyMiddleware = createWindmillProxyMiddleware;
exports.isWindmillProxyEnabled = isWindmillProxyEnabled;
const DEFAULT_CONFIG = {
    baseUrl: process.env.WINDMILL_URL || 'http://localhost:8000',
    token: process.env.WINDMILL_TOKEN || '',
    workspace: process.env.WINDMILL_WORKSPACE || 'main',
    timeout: 5 * 60 * 1000, // 5 minutes
    pollInterval: 1000 // 1 second
};
/**
 * Check if request should bypass Windmill proxy
 */
function shouldBypass(headers) {
    const bypassHeader = headers['x-bypass-windmill'] || headers['X-Bypass-Windmill'];
    return bypassHeader === 'true' || bypassHeader === '1';
}
/**
 * Create a Windmill job and wait for completion
 */
async function runWindmillJob(scriptPath, args, config = {}) {
    var _a;
    const cfg = { ...DEFAULT_CONFIG, ...config };
    if (!cfg.token) {
        throw new Error('WINDMILL_TOKEN not configured');
    }
    // Create job
    const createResponse = await fetch(`${cfg.baseUrl}/api/w/${cfg.workspace}/jobs/run/p/${scriptPath}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${cfg.token}`
        },
        body: JSON.stringify(args)
    });
    if (!createResponse.ok) {
        const errorText = await createResponse.text();
        throw new Error(`Failed to create Windmill job: ${createResponse.status} ${errorText}`);
    }
    const jobId = await createResponse.text();
    console.log(`[WindmillProxy] Created job: ${jobId}`);
    // Poll for completion
    const startTime = Date.now();
    while (Date.now() - startTime < cfg.timeout) {
        const statusResponse = await fetch(`${cfg.baseUrl}/api/w/${cfg.workspace}/jobs_u/completed/get_result/${jobId}`, {
            headers: {
                'Authorization': `Bearer ${cfg.token}`
            }
        });
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
        const jobInfoResponse = await fetch(`${cfg.baseUrl}/api/w/${cfg.workspace}/jobs_u/get/${jobId}`, {
            headers: {
                'Authorization': `Bearer ${cfg.token}`
            }
        });
        if (jobInfoResponse.ok) {
            const jobInfo = await jobInfoResponse.json();
            if (jobInfo.type === 'CompletedJob' && !jobInfo.success) {
                throw new Error(`Windmill job failed: ${((_a = jobInfo.result) === null || _a === void 0 ? void 0 : _a.error) || 'Unknown error'}`);
            }
        }
        await new Promise(resolve => setTimeout(resolve, cfg.pollInterval));
    }
    throw new Error(`Windmill job ${jobId} timed out after ${cfg.timeout}ms`);
}
/**
 * Proxy a chat completion request through Windmill
 */
async function proxyChatCompletion(agentType, request, config = {}) {
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
function createWindmillProxyMiddleware(agentType) {
    return async (req, res, next) => {
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
        }
        catch (error) {
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
function isWindmillProxyEnabled() {
    return !!process.env.WINDMILL_TOKEN && !!process.env.WINDMILL_URL;
}
