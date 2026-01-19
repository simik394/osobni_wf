import express from 'express';
import cors from 'cors';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { PerplexityClient } from './client';
import { config } from './config';

import { NotebookLMClient } from './notebooklm-client';
import { GeminiClient } from './gemini-client';
import { getGraphStore, GraphJob } from './graph-store';
import { notifyJobCompleted } from './discord';
import { configureNotifications, sendNotification } from './notify';
import { getRegistry } from './artifact-registry';

// Optional shared imports (may not be available in Docker)
let getFalkorClient: any = null;
// Define shouldBypass locally to ensure Windmill infinite loop protection works
// even if @agents/shared is missing or fails to load.
let shouldBypass: (headers: any) => boolean = (headers: any) => {
    return headers['x-bypass-windmill'] === 'true' || headers['x-windmill-bypass'] === 'true';
};
let proxyChatCompletion: any = null;
try {
    const shared = require('@agents/shared');
    getFalkorClient = shared.getFalkorClient;
    if (shared.shouldBypass) shouldBypass = shared.shouldBypass;
    proxyChatCompletion = shared.proxyChatCompletion;
} catch (e) {
    console.log('[Server] @agents/shared not available, FalkorDB/Windmill logging disabled');
    getFalkorClient = () => ({
        findSession: async () => null,
        logInteraction: async () => { }
    });
}
import {
    startChatCompletionTrace,
    completeChatCompletionTrace,
    failChatCompletionTrace,
    trackStreamingChunk,
    startGeminiResearchTrace,
    startPerplexityQueryTrace,
    flushObservability,
    shutdownObservability,
    isObservabilityEnabled,
    estimateTokens,
    TraceContext
} from './observability';

// Initialize graph store
const graphStore = getGraphStore();

export const app = express();
const PORT = config.port;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Initialize the client
const client = new PerplexityClient();
let notebookClient: NotebookLMClient | null = null;

// Health check endpoint
app.get('/health', (req, res) => {
    const health = {
        status: 'ok',
        uptime: process.uptime(),
        version: require('../package.json').version,
        dependencies: {
            falkordb: 'unknown',
            browser: 'unknown',
        }
    };

    // Check FalkorDB
    const falkorStatus = graphStore.getIsConnected();
    health.dependencies.falkordb = falkorStatus ? 'ok' : 'error';

    // Check Browser
    const browserStatus = client.isBrowserInitialized();
    health.dependencies.browser = browserStatus ? 'ok' : 'warn'; // Warn if not connected yet

    // Determine overall status
    if (!falkorStatus) {
        health.status = 'error'; // Hard dependency failure
    } else if (!browserStatus) {
        health.status = 'warn'; // Soft dependency failure (can connect lazily)
    }

    if (health.status === 'error') {
        return res.status(503).json(health);
    }
    res.json(health);
});

// Shutdown endpoint
app.post('/shutdown', async (req, res) => {
    console.log('[Server] Shutdown requested via API');
    res.json({ success: true, message: 'Shutting down...' });

    // Close browser and exit
    try {
        if (notebookClient) {
            // notebookClient doesn't have close, but client.close() handles the browser/context
        }
        await client.close();
    } catch (e) {
        console.error('Error during shutdown cleanup:', e);
    }

    process.exit(0);
});

// Windmill Webhook
app.post('/webhooks/windmill', async (req, res) => {
    const { jobId, status, result, error, type, query, notebookId, sourceTitle, pendingAudioId } = req.body;
    console.log(`[Webhook] Received Windmill callback for job ${jobId} (${status})`);

    try {
        // 1. Update FalkorDB based on type
        // If pendingAudioId is present, it's an audio generation job
        if (pendingAudioId) {
             const finalStatus = status === 'completed' || status === 'success' ? 'completed' : 'failed';
             // For pending audio, we might need to update the PendingAudio node
             // Assuming graphStore has methods for this or we run a cypher query
             if (finalStatus === 'completed') {
                await graphStore.updatePendingAudioStatus(pendingAudioId, 'completed');
             } else {
                await graphStore.updatePendingAudioStatus(pendingAudioId, 'failed', { error: error || 'Failed' });
             }
        } else if (jobId && type) {
             // Generic job update
             const finalStatus = status === 'completed' || status === 'success' ? 'completed' : 'failed';
             await graphStore.updateJobStatus(jobId, finalStatus, { result, error });
        }

        // 2. Notification
        if (status === 'completed' || status === 'success') {
            await sendNotification(`Job completed: ${type || 'Unknown'}\n${(typeof result === 'string' ? result : JSON.stringify(result))?.substring?.(0, 100) || ''}`, {
                title: `✅ Windmill Job Success`,
                priority: 'default',
                tags: ['windmill', 'success']
            });
        } else {
             await sendNotification(`Job failed: ${type || 'Unknown'}\n${error || ''}`, {
                title: `❌ Windmill Job Failed`,
                priority: 'high',
                tags: ['windmill', 'error']
            });
        }

        res.json({ success: true });
    } catch (e: any) {
        console.error('[Webhook] Error processing callback:', e);
        res.status(500).json({ error: e.message });
    }
});

// Query endpoint
app.post('/query', async (req, res) => {
    try {
        const { query, session, name, deepResearch } = req.body;

        if (!query || typeof query !== 'string') {
            return res.status(400).json({ error: 'Query parameter is required and must be a string' });
        }

        console.log(`[Server] Received query: "${query}" (Session: ${session || 'new'}, Name: ${name || 'none'}, DeepResearch: ${deepResearch || false})`);

        // Non-blocking deep research
        if (deepResearch) {
            const job = await graphStore.addJob('deepResearch', query, { session, name });
            console.log(`[Server] Deep research job ${job.id} queued.`);

            // Process async
            (async () => {
                try {
                    await graphStore.updateJobStatus(job.id, 'running');
                    const result = await client.query(query, { sessionId: session, sessionName: name, deepResearch: true });
                    await graphStore.updateJobStatus(job.id, 'completed', { result });
                    console.log(`[Server] Deep research job ${job.id} completed.`);
                    notifyJobCompleted(job.id, 'Deep Research', query, true, result?.answer?.substring(0, 100));
                } catch (err: any) {
                    console.error(`[Server] Deep research job ${job.id} failed:`, err);
                    await graphStore.updateJobStatus(job.id, 'failed', { error: err.message });
                    notifyJobCompleted(job.id, 'Deep Research', query, false, err.message);
                }
            })();

            return res.status(202).json({
                success: true,
                message: 'Deep research started',
                jobId: job.id,
                statusUrl: `/jobs/${job.id}`
            });
        }

        // Synchronous query
        const result = await client.query(query, { sessionId: session, sessionName: name });

        res.json({
            success: true,
            data: result
        });
    } catch (error: any) {
        console.error('[Server] Query failed:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Query execution failed'
        });
    }
});

// NotebookLM Endpoints

app.post('/notebook/list', async (req, res) => {
    try {
        if (!notebookClient) {
            notebookClient = await client.createNotebookClient();
        }
        const notebooks = await notebookClient.listNotebooks();
        res.json(notebooks);
    } catch (e: any) {
        console.error('[Server] List notebooks failed:', e);
        res.status(500).json({ error: e.message });
    }
});

app.post('/notebook/create', async (req, res) => {
    try {
        const { title } = req.body;
        if (!title) return res.status(400).json({ error: 'Title is required' });

        console.log(`[Server] Creating notebook: ${title}`);

        // Always create a new client context/page for a new notebook? 
        // Or reuse if one exists but navigate home?
        // The implementation of createNotebook in client navigates home.
        // But separate pages might be better.
        // For now, let's keep one active notebook client.

        if (notebookClient) {
            // Close old one?
            // notebookClient.close? (not implemented)
            // Just overwrite for now
        }

        notebookClient = await client.createNotebookClient();
        await notebookClient.createNotebook(title);

        res.json({ success: true, message: `Notebook '${title}' created` });
    } catch (e: any) {
        console.error('[Server] Create notebook failed:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

app.post('/notebook/add-source', async (req, res) => {
    try {
        const { url, notebookTitle } = req.body;
        if (!url) return res.status(400).json({ error: 'URL is required' });

        if (!notebookClient) {
            // Attempt to create client if not exists
            notebookClient = await client.createNotebookClient();
            // But we need to be in a notebook.
        }

        if (notebookTitle) {
            console.log(`[Server] Switching to notebook: ${notebookTitle}`);
            await notebookClient.openNotebook(notebookTitle);
        } else {
            // Assume already in a notebook or default
            // If we just stared, we might be on home.
            // Ideally we force user to provide title or rely on "active" state.
        }

        console.log(`[Server] Adding source: ${url}`);
        await notebookClient.addSourceUrl(url);

        res.json({ success: true, message: `Source added` });
    } catch (e: any) {
        console.error('[Server] Add source failed:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

app.post('/notebook/add-drive-source', async (req, res) => {
    try {
        const { docNames, notebookTitle } = req.body;

        if (!docNames || !Array.isArray(docNames) || docNames.length === 0) {
            return res.status(400).json({ success: false, error: 'docNames array is required' });
        }

        if (!notebookClient) {
            notebookClient = await client.createNotebookClient();
        }

        console.log(`[Server] Adding Drive sources: ${docNames.join(', ')}`);
        await notebookClient.addSourceFromDrive(docNames, notebookTitle);

        res.json({ success: true, message: `Drive sources added` });
    } catch (e: any) {
        console.error('[Server] Add Drive source failed:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

app.post('/notebook/add-text', async (req, res) => {
    try {
        const { notebookTitle, text, sourceTitle } = req.body;

        if (!text || typeof text !== 'string') {
            return res.status(400).json({ success: false, error: 'text (string) is required' });
        }

        if (!notebookClient) {
            notebookClient = await client.createNotebookClient();
        }

        console.log(`[Server] Adding text source (${text.length} chars) to notebook: ${notebookTitle || 'current'}`);
        await notebookClient.addSourceText(text, sourceTitle, notebookTitle);

        res.json({ success: true, message: 'Text source added' });
    } catch (e: any) {
        console.error('[Server] Add text source failed:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

app.post('/notebook/generate-audio', async (req, res) => {
    try {
        const { notebookTitle, sources, customPrompt, dryRun } = req.body;

        // Import WindmillClient for job queuing
        const { getWindmillClient } = await import('./windmill-client');
        const windmill = getWindmillClient();

        // Check if Windmill is configured
        if (!windmill.isConfigured()) {
            console.warn('[Server] Windmill not configured, falling back to local execution');
            // Fallback to local execution (legacy)
            if (!notebookClient) {
                notebookClient = await client.createNotebookClient();
            }
            if (notebookClient?.isBusy) {
                return res.status(409).json({ success: false, error: 'NotebookLM client is busy. Use Windmill for queued execution.' });
            }
            const job = await graphStore.addJob('audio-generation', notebookTitle || 'default', { sources, customPrompt, dryRun });
            (async () => {
                try {
                    await graphStore.updateJobStatus(job.id, 'running');
                    await notebookClient!.generateAudioOverview(notebookTitle, sources, customPrompt, true, dryRun);
                    await graphStore.updateJobStatus(job.id, 'completed', { result: { message: 'Audio generated' } });
                } catch (err: any) {
                    await graphStore.updateJobStatus(job.id, 'failed', { error: err.message });
                }
            })();
            return res.status(202).json({ success: true, message: 'Audio generation started (local fallback)', jobId: job.id });
        }

        // Route through Windmill for proper queuing (prevents race conditions)
        console.log(`[Server] Queueing ${sources?.length || 0} audio generation(s) via Windmill...`);

        const sourceList = sources || [];
        const { queued, failed } = await windmill.queueAudioGenerations(
            notebookTitle || 'default',
            sourceList,
            customPrompt
        );

        if (failed.length > 0) {
            console.warn(`[Server] ${failed.length} job(s) failed to queue:`, failed.map(f => f.error));
        }

        res.status(202).json({
            success: queued.length > 0,
            message: `Queued ${queued.length} audio generation(s) via Windmill`,
            jobs: queued.map(j => ({ jobId: j.jobId, source: j.error })),
            failed: failed.length > 0 ? failed : undefined
        });

    } catch (e: any) {
        console.error('[Server] Generate audio request failed:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});


app.post('/notebook/audio-status', async (req, res) => {
    try {
        const { notebookTitle } = req.body;

        if (!notebookClient) {
            notebookClient = await client.createNotebookClient();
        }

        console.log(`[Server] Checking audio status for: ${notebookTitle || 'current'}`);
        const status = await notebookClient.checkAudioStatus(notebookTitle);

        res.json({ success: true, ...status });
    } catch (e: any) {
        console.error('[Server] Audio status check failed:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

app.post('/notebooklm/create-audio-from-doc', async (req, res) => {
    try {
        const { researchDocId, notebookTitle, dryRun } = req.body;
        if (!researchDocId) return res.status(400).json({ error: 'researchDocId is required' });

        // 1. Check if already exists
        const existingAudio = await graphStore.getAudioForResearchDoc(researchDocId);
        if (existingAudio && !dryRun) {
            console.log(`[Server] Audio already exists for doc ${researchDocId}: ${existingAudio.id}`);
            return res.json({ success: true, audio: existingAudio, cached: true });
        }

        // 2. Get ResearchDoc lineage
        const lineage = await graphStore.getLineage(researchDocId);
        const docNode = lineage.find(n => n.type === 'ResearchDoc' || n.type === 'Document'); // Support legacy node type

        if (!docNode) {
            // Fallback: try direct lookup if lineage fails (e.g. if graph is disconnected fragments)
            // But we don't have direct lookup exposed yet. 
            // For now, assume if lineage fails, doc doesn't exist or is orphan.
            return res.status(404).json({ error: 'ResearchDoc not found' });
        }

        const title = docNode.title;
        const content = docNode.content || ''; // Legacy Document nodes might not have content stored?
        // Note: ResearchDoc has content. Document (legacy) might not.

        if (!content && !docNode.url) {
            return res.status(400).json({ error: 'Document has no content or URL to process' });
        }

        console.log(`[Server] Converting ResearchDoc to Audio: ${title} (${content.length} chars)`);

        if (!notebookClient) {
            // Lazy init: ensure browser is initialized before creating client
            try {
                await client.init({ local: true });
            } catch (initErr: any) {
                console.warn(`[Server] Browser lazy init failed: ${initErr.message}`);
                return res.status(503).json({ error: 'Browser not available', details: initErr.message });
            }
            notebookClient = await client.createNotebookClient();
        }

        // 3. Create or Open Notebook
        // Use a dedicated notebook for research audio? Or per session?
        // Let's use a "Research Audio" notebook default if not provided
        const targetNotebook = notebookTitle || `Research Audio: ${new Date().toISOString().split('T')[0]}`;

        // 4. Try to open notebook, create if not exists
        try {
            await notebookClient.openNotebook(targetNotebook);
            console.log(`[Server] Opened existing notebook: ${targetNotebook}`);
        } catch (openErr: any) {
            if (openErr.message?.includes('not found')) {
                console.log(`[Server] Notebook not found, creating: ${targetNotebook}`);
                await notebookClient.createNotebook(targetNotebook);
            } else {
                throw openErr;
            }
        }

        // 5. Add Source
        // If content is available, paste it. If only URL (legacy), add URL.
        if (content) {
            // We prepend title to content to give context
            const fullText = `# ${title}\n\n${content}`;
            // Don't pass notebookTitle since we already opened it
            await notebookClient.addSourceText(fullText, title);
        } else if (docNode.url) {
            await notebookClient.addSourceUrl(docNode.url);
        }

        // 5. Generate Audio
        // We trigger generation and wait for it
        if (notebookClient.isBusy) {
            return res.status(409).json({ error: 'NotebookLM client is busy' });
        }

        console.log(`[Server] Triggering audio generation for: ${title}`);
        const result = await notebookClient.generateAudioOverview(targetNotebook, [title], undefined, true, dryRun);

        if (!result.success) {
            throw new Error('Audio generation failed or timed out');
        }

        if (dryRun) {
            return res.json({ success: true, dryRun: true });
        }

        // 6. Download Audio
        const audioName = result.artifactTitle || `Audio Overview - ${title}`;
        const safeFilename = audioName.replace(/[^a-zA-Z0-9.\-_]/g, '_');

        // Define local output directory
        const outputDir = config.paths.resultsDir;
        const fs = require('fs');
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        const localFilename = `${safeFilename}__${Date.now()}.mp3`;
        const localPath = `${outputDir}/${localFilename}`;

        console.log(`[Server] Downloading audio to: ${localPath}`);

        const downloadSuccess = await notebookClient.downloadAudio(targetNotebook, localPath, {
            audioTitlePattern: result.artifactTitle, // Explicitly target the one we just made
            latestOnly: true
        });

        if (!downloadSuccess) {
            console.warn('[Server] Download reported failure, but proceeding to record in graph just in case.');
        }

        // 7. Track in Graph
        const audioNode = await graphStore.createResearchAudio({
            docId: researchDocId,
            path: localPath,
            duration: 0
        });

        res.json({ success: true, audio: audioNode, downloaded: downloadSuccess, localPath });

    } catch (e: any) {
        console.error('[Server] Create audio from doc failed:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

app.get('/jobs/:id', async (req, res) => {
    const jobId = req.params.id;
    const job = await graphStore.getJob(jobId);

    if (!job) {
        return res.status(404).json({ success: false, error: 'Job not found' });
    }

    res.json({ success: true, job });
});

app.get('/jobs', async (req, res) => {
    const jobs = await graphStore.listJobs();
    res.json({ success: true, jobs });
});

// ============================================================================
// Async Deep Research Endpoints
// ============================================================================

// Start async deep research - returns job ID immediately
app.post('/deep-research/start', async (req, res) => {
    try {
        const { query, gem, sessionId } = req.body;

        if (!query) {
            return res.status(400).json({ success: false, error: 'Query is required' });
        }

        // Create job in FalkorDB
        const job = await graphStore.addJob('deepResearch', query, { gem, sessionId });
        console.log(`[Server] Deep research job created: ${job.id}`);

        // Fire and forget - run deep research in background
        (async () => {
            try {
                await graphStore.updateJobStatus(job.id, 'running');

                // Initialize Gemini client if not already
                if (!geminiClient) {
                    geminiClient = await client.createGeminiClient();
                    await geminiClient.init();
                }

                // Run deep research
                const result = await geminiClient.startDeepResearch(query, gem);

                // Update job with result
                await graphStore.updateJobStatus(job.id, 'completed', { result });
                console.log(`[Server] Deep research job ${job.id} completed`);
            } catch (e: any) {
                console.error(`[Server] Deep research job ${job.id} failed:`, e);
                await graphStore.updateJobStatus(job.id, 'failed', { error: e.message });
            }
        })();

        res.json({ success: true, jobId: job.id, status: 'queued' });
    } catch (e: any) {
        console.error('[Server] Failed to start deep research:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

// Get deep research job status
app.get('/deep-research/status/:id', async (req, res) => {
    const job = await graphStore.getJob(req.params.id);

    if (!job) {
        return res.status(404).json({ success: false, error: 'Job not found' });
    }

    res.json({
        success: true,
        jobId: job.id,
        status: job.status,
        query: job.query,
        createdAt: job.createdAt,
        startedAt: job.startedAt,
        completedAt: job.completedAt,
        error: job.error
    });
});

// Get deep research result (only when completed)
app.get('/deep-research/result/:id', async (req, res) => {
    const job = await graphStore.getJob(req.params.id);

    if (!job) {
        return res.status(404).json({ success: false, error: 'Job not found' });
    }

    if (job.status !== 'completed') {
        return res.status(202).json({
            success: false,
            error: 'Job not completed yet',
            status: job.status
        });
    }

    res.json({
        success: true,
        jobId: job.id,
        result: job.result
    });
});

app.post('/notebook/dump', async (req, res) => {
    try {
        if (!notebookClient) {
            notebookClient = await client.createNotebookClient();
            // Try to existing page?
        }
        console.log('[Server] Dumping state...');
        const paths = await notebookClient.dumpState('manual_dump');
        res.json({ success: true, paths });
    } catch (e: any) {
        console.error('[Server] Dump failed:', e);
    }
});

// ============================================================================
// OpenAI-Compatible API Types
// ============================================================================

interface ChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

interface ChatCompletionRequest {
    model: string;
    messages: ChatMessage[];
    temperature?: number;
    max_tokens?: number;
    stream?: boolean;
    session?: string;        // Session name for conversation continuity
    session_id?: string;     // Specific session ID (alternative)
}

interface ChatCompletionChoice {
    index: number;
    message: {
        role: 'assistant';
        content: string;
    };
    finish_reason: 'stop' | 'length' | 'error';
}

interface ChatCompletionResponse {
    id: string;
    object: 'chat.completion';
    created: number;
    model: string;
    choices: ChatCompletionChoice[];
    usage: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
    session?: string;  // Echo session for client tracking
}

interface ModelInfo {
    id: string;
    object: 'model';
    created: number;
    owned_by: string;
}

// SSE Streaming Types
interface ChatCompletionChunkChoice {
    index: number;
    delta: {
        role?: 'assistant';
        content?: string;
    };
    finish_reason: 'stop' | 'length' | null;
}

interface ChatCompletionChunk {
    id: string;
    object: 'chat.completion.chunk';
    created: number;
    model: string;
    choices: ChatCompletionChunkChoice[];
}

function generateId(): string {
    return 'chatcmpl-' + Math.random().toString(36).substring(2, 15);
}

/**
 * Format all messages into a single conversation string.
 * Uses "Role: content" format with separators for multi-turn context.
 */
function formatConversation(messages: ChatMessage[]): string {
    return messages
        .map(m => {
            const role = m.role.charAt(0).toUpperCase() + m.role.slice(1);
            return `${role}: ${m.content}`;
        })
        .join('\n\n---\n\n');
}

/**
 * Validate messages array for common input errors.
 * Returns null if valid, error message string if invalid.
 */
function validateMessages(messages: ChatMessage[]): string | null {
    const validRoles = ['user', 'assistant', 'system'];

    // Empty array check
    if (messages.length === 0) {
        return 'Messages array cannot be empty';
    }

    // First pass: validate each message structure
    for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];

        // Check role exists and is valid (do this FIRST)
        if (!msg.role || !validRoles.includes(msg.role)) {
            return `Invalid role '${msg.role}' at message ${i}. Must be one of: ${validRoles.join(', ')}`;
        }

        // Check content is string
        if (typeof msg.content !== 'string') {
            return `Message ${i} content must be a string, got ${typeof msg.content}`;
        }

        // Check content is not empty (for user messages)
        if (msg.role === 'user' && msg.content.trim().length === 0) {
            return `User message ${i} cannot have empty content`;
        }
    }

    // Second pass: check for at least one user message
    const hasUserMessage = messages.some(m => m.role === 'user');
    if (!hasUserMessage) {
        return 'At least one user message is required';
    }

    return null; // Valid
}

// ============================================================================
// OpenAI-Compatible Endpoints
// ============================================================================

// List available models
app.get('/v1/models', (req, res) => {
    const models = {
        object: 'list',
        data: [
            {
                id: 'gemini-rsrch',
                object: 'model' as const,
                created: Math.floor(Date.now() / 1000),
                owned_by: 'rsrch'
            },
            {
                id: 'gemini-deep-research',
                object: 'model' as const,
                created: Math.floor(Date.now() / 1000),
                owned_by: 'rsrch'
            },
            {
                id: 'perplexity',
                object: 'model' as const,
                created: Math.floor(Date.now() / 1000),
                owned_by: 'rsrch'
            }
        ]
    };
    res.json(models);
});

// Get specific model info
app.get('/v1/models/:modelId', (req, res) => {
    const { modelId } = req.params;
    const supportedModels = ['gemini-rsrch', 'perplexity'];

    if (supportedModels.includes(modelId)) {
        res.json({
            id: modelId,
            object: 'model',
            created: Math.floor(Date.now() / 1000),
            owned_by: 'rsrch'
        });
    } else {
        res.status(404).json({
            error: {
                message: `Model '${modelId}' not found`,
                type: 'invalid_request_error',
                code: 404
            }
        });
    }
});

// Chat completions endpoint
app.post('/v1/chat/completions', async (req, res) => {
    try {
        const request = req.body as ChatCompletionRequest;

        // Windmill proxy check - route through Windmill unless bypassed
        if (proxyChatCompletion && config.windmill?.token && !shouldBypass(req.headers)) {
            console.log('[Server] Routing through Windmill proxy...');
            try {
                const result = await proxyChatCompletion('rsrch', request);
                return res.json(result);
            } catch (windmillError: any) {
                console.error('[Server] Windmill proxy failed:', windmillError.message);
                // Fall through to direct execution on Windmill failure
            }
        }

        // Validate request
        if (!request.messages || !Array.isArray(request.messages)) {
            return res.status(400).json({
                error: {
                    message: 'Missing or invalid "messages" field',
                    type: 'invalid_request_error',
                    code: 400
                }
            });
        }

        // Validate message content
        const validationError = validateMessages(request.messages);
        if (validationError) {
            return res.status(400).json({
                error: {
                    message: validationError,
                    type: 'invalid_request_error',
                    code: 400
                }
            });
        }

        // SSE Streaming
        if (request.stream) {
            // Only Gemini supports streaming for now
            const model = request.model || 'gemini-rsrch';
            if (model === 'perplexity' || model.includes('perplexity')) {
                return res.status(501).json({
                    error: {
                        message: 'Streaming is not supported for Perplexity model',
                        type: 'not_implemented',
                        code: 501
                    }
                });
            }

            // Set up SSE headers
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            res.flushHeaders();

            const id = generateId();
            const created = Math.floor(Date.now() / 1000);

            const sendSSE = (data: ChatCompletionChunk | '[DONE]') => {
                if (data === '[DONE]') {
                    res.write('data: [DONE]\n\n');
                } else {
                    res.write(`data: ${JSON.stringify(data)}\n\n`);
                }
            };

            try {
                // Ensure Gemini client
                if (!geminiClient) {
                    console.log('[OpenAI API] Creating Gemini client for streaming...');
                    geminiClient = await client.createGeminiClient();
                    await geminiClient.init();
                }

                // Extract prompt
                const userMessages = request.messages.filter(m => m.role === 'user');
                const prompt = userMessages[userMessages.length - 1]?.content || '';

                console.log(`[OpenAI API] Streaming: "${prompt.substring(0, 50)}..."`);

                // Send initial role chunk
                sendSSE({
                    id,
                    object: 'chat.completion.chunk',
                    created,
                    model,
                    choices: [{
                        index: 0,
                        delta: { role: 'assistant' },
                        finish_reason: null
                    }]
                });

                // Stream using Gemini client
                await geminiClient.researchWithStreaming(
                    prompt,
                    (chunk) => {
                        if (chunk.content) {
                            sendSSE({
                                id,
                                object: 'chat.completion.chunk',
                                created,
                                model,
                                choices: [{
                                    index: 0,
                                    delta: { content: chunk.content },
                                    finish_reason: chunk.isComplete ? 'stop' : null
                                }]
                            });
                        }
                        if (chunk.isComplete) {
                            sendSSE('[DONE]');
                        }
                    }
                );

                res.end();
                console.log('[OpenAI API] Streaming complete');

            } catch (error: any) {
                console.error('[OpenAI API] Streaming failed:', error);
                sendSSE({
                    id,
                    object: 'chat.completion.chunk',
                    created,
                    model,
                    choices: [{
                        index: 0,
                        delta: { content: `\n\n[ERROR: ${error.message}]` },
                        finish_reason: 'stop'
                    }]
                });
                sendSSE('[DONE]');
                res.end();
            }

            return;
        }

        // Non-streaming response (Perplexity or Gemini)
        console.log(`[OpenAI API] Processing non-streaming chat completion with model: ${request.model}`);

        // Get last user message for logging
        const lastMessage = request.messages.filter(m => m.role === 'user').pop();

        /*
        const falkor = getFalkorClient();
        // Log query
        if (request.session && lastMessage) {
            console.log(`[FalkorDB] Logging query for session: ${request.session}`);
            try {
                // Resolve session name to ID if needed
                const sessionNode = await falkor.findSession(request.session);

                if (sessionNode) {
                    await falkor.logInteraction(sessionNode.id, 'user', 'query', lastMessage.content);
                    console.log(`[FalkorDB] Query logged successfully to session ${sessionNode.id}`);
                } else {
                    console.warn(`[FalkorDB] Session '${request.session}' not found, skipping log`);
                }
            } catch (e: any) {
                console.error('[FalkorDB] Failed to log query:', e);
            }
        }
        */

        // Start observability trace
        const traceCtx = startChatCompletionTrace(request);

        // Format full conversation for multi-turn context
        const prompt = formatConversation(request.messages);

        console.log(`[OpenAI API] Chat completion request: "${prompt.substring(0, 50)}..."`);

        let responseText: string;
        const model = request.model || 'gemini-rsrch';

        try {
            // Determine options
            const useDeepResearch = model === 'gemini-deep-research';

            const sessionId = request.session; // Support non-standard 'session'

            // Route to appropriate backend based on model
            if (model === 'perplexity' || model.includes('perplexity')) {
                // Use Perplexity
                console.log('[OpenAI API] Using Perplexity backend');
                const result = await client.query(prompt, {
                    sessionId: request.session_id,
                    sessionName: sessionId, // reuse parsed session
                    deepResearch: useDeepResearch
                });
                responseText = result?.answer || 'No response';
            } else {
                // Use Gemini (default)
                console.log(`[OpenAI API] Using Gemini backend (Model: ${model}, Deep: ${useDeepResearch}, Session: ${sessionId || 'current'})`);

                // Ensure client is initialized
                if (!geminiClient) {
                    console.log('[OpenAI API] Creating Gemini client...');
                    geminiClient = await client.createGeminiClient();
                    try {
                        await geminiClient.init();
                    } catch (e) {
                        console.error('[OpenAI API] Initial Gemini init failed, retrying once...', e);
                        geminiClient = null; // Reset
                        geminiClient = await client.createGeminiClient();
                        await geminiClient.init();
                    }
                }

                if (request.stream) {
                    // Streaming response
                    res.setHeader('Content-Type', 'text/event-stream');
                    res.setHeader('Cache-Control', 'no-cache');
                    res.setHeader('Connection', 'keep-alive');
                    res.flushHeaders();

                    try {
                        const traceId = generateId();
                        const createdTime = Math.floor(Date.now() / 1000);

                        // Send initial role chunk
                        res.write(`data: ${JSON.stringify({
                            id: traceId,
                            object: 'chat.completion.chunk',
                            created: createdTime,
                            model,
                            choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }]
                        })}\n\n`);

                        const streamCallback = (chunk: any) => {
                            if (chunk.content) {
                                res.write(`data: ${JSON.stringify({
                                    id: traceId,
                                    object: 'chat.completion.chunk',
                                    created: createdTime,
                                    model,
                                    choices: [{ index: 0, delta: { content: chunk.content }, finish_reason: null }]
                                })}\n\n`);
                            }
                        };

                        let text = '';
                        try {
                            text = await geminiClient.researchWithStreaming(
                                prompt,
                                streamCallback,
                                {
                                    deepResearch: useDeepResearch,
                                    sessionId: sessionId
                                }
                            );
                        } catch (e: any) {
                            if (e.message.includes('Context not initialized') || e.message.includes('Target closed') || e.message.includes('Session closed')) {
                                console.warn('[OpenAI API] Gemini client stale/closed, re-initializing and retrying streaming...');
                                geminiClient = await client.createGeminiClient();
                                await geminiClient.init();
                                text = await geminiClient.researchWithStreaming(
                                    prompt,
                                    streamCallback,
                                    {
                                        deepResearch: useDeepResearch,
                                        sessionId: sessionId,
                                        // Force reset if not using specific session ID
                                        resetSession: !sessionId
                                    }
                                );
                            } else {
                                throw e;
                            }
                        }

                        // Final chunk
                        res.write(`data: ${JSON.stringify({
                            id: traceId,
                            object: 'chat.completion.chunk',
                            created: createdTime,
                            model,
                            choices: [{ index: 0, delta: {}, finish_reason: 'stop' }]
                        })}\n\n`);
                        res.write('data: [DONE]\n\n');
                        res.end();
                        responseText = text;

                    } catch (e: any) {
                        console.error('[OpenAI API] Streaming research failed:', e);
                        res.end(); // Ensure stream ends on error
                        return; // Don't proceed to standard logging
                    }

                } else {
                    // Non-streaming response
                    try {
                        responseText = await geminiClient.research(prompt, {
                            deepResearch: useDeepResearch,
                            sessionId: sessionId,
                            // Force reset if not using specific session ID
                            resetSession: !sessionId
                        });
                    } catch (e: any) {
                        if (e.message.includes('Context not initialized') || e.message.includes('Target closed')) {
                            console.warn('[OpenAI API] Gemini client stale/closed, re-initializing and retrying...');
                            geminiClient = await client.createGeminiClient();
                            await geminiClient.init();
                            responseText = await geminiClient.research(prompt, {
                                deepResearch: useDeepResearch,
                                sessionId: sessionId,
                                resetSession: !sessionId
                            });
                        } else {
                            throw e;
                        }
                    }
                }
            }

            // Complete observability trace
            completeChatCompletionTrace(traceCtx, responseText);

            // Log full response to FalkorDB
            /*
            if (request.session) {
                falkor.logInteraction(request.session, 'agent', 'response', responseText)
                    .catch((e: any) => console.error('[FalkorDB] Failed to log response:', e));
            }
            */

            // Build OpenAI-compatible response
            const response: ChatCompletionResponse = {
                id: generateId(),
                object: 'chat.completion',
                created: Math.floor(Date.now() / 1000),
                model,
                choices: [{
                    index: 0,
                    message: {
                        role: 'assistant',
                        content: responseText
                    },
                    finish_reason: 'stop'
                }],
                usage: {
                    prompt_tokens: estimateTokens(prompt),
                    completion_tokens: estimateTokens(responseText),
                    total_tokens: estimateTokens(prompt) + estimateTokens(responseText)
                },
                session: request.session || request.session_id
            };

            console.log(`[OpenAI API] Response ready (${responseText.length} chars)`);
            res.json(response);
        } catch (innerError: any) {
            failChatCompletionTrace(traceCtx, innerError);
            throw innerError;
        }

    } catch (error: any) {
        console.error('[OpenAI API] Chat completion failed:', error);
        res.status(500).json({
            error: {
                message: error.message || 'Request failed',
                type: 'api_error',
                code: 500
            }
        });
    }
});

// ============================================================================
// Gemini Endpoints (Original)
// ============================================================================
let geminiClient: GeminiClient | null = null;

app.post('/gemini/research', async (req, res) => {
    try {
        const { query } = req.body;
        if (!query) return res.status(400).json({ error: 'Query is required' });

        // Check if client wants SSE streaming
        const wantsSSE = req.headers.accept?.includes('text/event-stream');

        if (!geminiClient) {
            console.log('[Server] Creating Gemini client...');
            // Lazy browser init if startup failed
            if (!client.isBrowserInitialized()) {
                console.log('[Server] Browser not initialized - connecting now...');
                await client.init();
            }
            geminiClient = await client.createGeminiClient();
            await geminiClient.init();
        }

        // Default to reset session for standard research queries
        const options = { resetSession: req.body.resetSession ?? true, model: req.body.model };

        if (wantsSSE) {
            // SSE streaming mode
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            res.flushHeaders();

            // Send progress events as they occur
            const progressHandler = (data: any) => {
                res.write(`data: ${JSON.stringify(data)}\n\n`);
            };
            geminiClient.on('progress', progressHandler);

            try {
                console.log(`[Server] Generating Gemini response (SSE) for: "${query}"`);
                // Note: research() doesn't officially support streaming callback in the legacy method, 
                // but we pass options for future compatibility if research() signatures align
                const response = await geminiClient.research(query, { deepResearch: false, ...options });

                // Send final result
                res.write(`data: ${JSON.stringify({ type: 'result', success: true, data: response })}\n\n`);
                res.end();
            } finally {
                geminiClient.removeListener('progress', progressHandler);
            }
        } else {
            // Traditional JSON response mode
            console.log(`[Server] Generating Gemini response for: "${query}"`);
            const response = await geminiClient.research(query);
            res.json({ success: true, data: response });
        }
    } catch (e: any) {
        console.error('[Server] Gemini research failed:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

app.get('/gemini/sessions', async (req, res) => {
    try {
        const limitStr = req.query.limit as string;
        const limit = limitStr ? parseInt(limitStr) : 20;
        const offsetStr = req.query.offset as string;
        const offset = offsetStr ? parseInt(offsetStr) : 0;

        if (!geminiClient) {
            geminiClient = await client.createGeminiClient();
            await geminiClient.init();
        }

        const sessions = await geminiClient.listSessions(limit, offset);

        // Sync to graph in the background
        if (sessions.length > 0) {
            console.log(`[Server] Syncing ${sessions.length} Gemini sessions to FalkorDB...`);
            (async () => {
                for (const session of sessions) {
                    await graphStore.createOrUpdateGeminiSession({
                        sessionId: session.id || '',
                        title: session.name
                    });
                }
                console.log('[Server] Gemini session sync complete.');
            })().catch(err => {
                console.error('[Server] Background Gemini session sync failed:', err);
            });
        }

        res.json({ success: true, data: sessions });
    } catch (e: any) {
        console.error('[Server] Gemini list sessions failed:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

app.get('/gemini/list-research-docs', async (req, res) => {
    try {
        const limitStr = req.query.limit as string;
        const limit = limitStr ? parseInt(limitStr) : 10;
        const sessionId = req.query.sessionId as string;

        if (!geminiClient) {
            console.log('[Server] Creating Gemini client...');
            geminiClient = await client.createGeminiClient();
            await geminiClient.init();
        }

        let docs;
        if (sessionId) {
            console.log(`[Server] Listing research docs for session: ${sessionId}`);
            await geminiClient.openSession(sessionId);
            docs = await geminiClient.getAllResearchDocsInSession();
        } else {
            console.log(`[Server] Listing recent research docs (limit: ${limit})...`);
            docs = await geminiClient.listDeepResearchDocuments(limit);
        }

        res.json({ success: true, data: docs });
    } catch (e: any) {
        console.error('[Server] Gemini list research docs failed:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

// Sync Gemini research docs to FalkorDB
app.post('/gemini/sync-graph', async (req, res) => {
    try {
        const limit = req.body.limit || 50;

        if (!geminiClient) {
            console.log('[Server] Creating Gemini client for sync...');
            geminiClient = await client.createGeminiClient();
            await geminiClient.init();
        }

        console.log(`[Server] Syncing Gemini research docs to FalkorDB (limit: ${limit})...`);

        // List research docs from Gemini
        const docs = await geminiClient.listDeepResearchDocuments(limit);
        console.log(`[Server] Found ${docs.length} research documents`);

        let synced = 0;
        const syncedIds: string[] = [];

        for (const doc of docs) {
            try {
                const docId = doc.sessionId || '';
                if (!docId) {
                    console.log(`[Sync] Skipping doc without sessionId: ${doc.title}`);
                    continue;
                }

                // Create session in FalkorDB (duplicates will fail silently)
                const sessionId = `gemini-${docId}`;
                await graphStore.createSession({
                    platformId: docId,
                    platform: 'gemini',
                    title: doc.title || doc.firstHeading || ''
                });

                syncedIds.push(docId);
                synced++;
                console.log(`[Sync] Synced: ${doc.title || docId}`);
            } catch (e: any) {
                // Duplicate constraint errors are expected for already-synced docs
                if (e.message?.includes('duplicate') || e.message?.includes('already exists')) {
                    console.log(`[Sync] Already synced: ${doc.sessionId}`);
                } else {
                    console.warn(`[Sync] Failed to sync ${doc.sessionId}: ${e.message}`);
                }
            }
        }

        res.json({
            success: true,
            synced,
            total: docs.length,
            syncedIds
        });
    } catch (e: any) {
        console.error('[Server] Gemini sync-graph failed:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

// Graph Endpoints

app.get('/graph/status', async (req, res) => {
    try {
        const jobs = await graphStore.listJobs();
        const stats = {
            jobs: jobs.length,
            queued: jobs.filter(j => j.status === 'queued').length,
            running: jobs.filter(j => j.status === 'running').length,
            completed: jobs.filter(j => j.status === 'completed').length,
            failed: jobs.filter(j => j.status === 'failed').length,
        };

        res.json({
            success: true,
            connection: 'OK',
            stats
        });
    } catch (e: any) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.get('/graph/conversations', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit as string) || 50;
        const conversations = await graphStore.getConversationsByPlatform('gemini', limit);
        res.json({ success: true, data: conversations });
    } catch (e: any) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// Existing export-to-docs endpoint
app.post('/gemini/export-to-docs', async (req, res) => {
    try {
        const { sessionId } = req.body;

        if (!geminiClient) {
            console.log('[Server] Creating Gemini client...');
            geminiClient = await client.createGeminiClient();
            await geminiClient.init();
        }

        if (sessionId) {
            console.log(`[Server] Navigating to session ${sessionId} for export...`);
            await geminiClient.openSession(sessionId);
        }

        console.log('[Server] Exporting current session to Google Docs...');
        const result = await geminiClient.exportCurrentToGoogleDocs();

        if (result.docId) {
            console.log(`[Server] Export success: ${result.docTitle} (${result.docId})`);
            res.json({ success: true, data: result });
        } else {
            res.status(500).json({ success: false, error: 'Export failed - no document ID returned' });
        }

    } catch (e: any) {
        console.error('[Server] Gemini export failed:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

app.post('/gemini/get-research-info', async (req, res) => {
    try {
        const { sessionId } = req.body;

        if (!geminiClient) {
            geminiClient = await client.createGeminiClient();
            await geminiClient.init();
        }

        if (sessionId) {
            console.log(`[Server] Navigating to session ${sessionId} for research extraction...`);
            await geminiClient.openSession(sessionId);
        }

        const info = await geminiClient.getResearchInfo();
        res.json({ success: true, data: info });
    } catch (e: any) {
        console.error('[Server] Gemini get info failed:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

// ============================================================================
// Additional Gemini Endpoints (Production CLI Support)
// ============================================================================

app.get('/gemini/sources', async (req, res) => {
    try {
        if (!geminiClient) {
            geminiClient = await client.createGeminiClient();
            await geminiClient.init();
        }
        const sources = await geminiClient.getContextSources();
        res.json({ success: true, sources });
    } catch (e: any) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.post('/gemini/set-model', async (req, res) => {
    try {
        const { model } = req.body;
        if (!model) return res.status(400).json({ error: 'Model name is required' });

        if (!geminiClient) {
            geminiClient = await client.createGeminiClient();
            await geminiClient.init();
        }

        console.log(`[Server] Setting Gemini model to: ${model}`);
        const success = await geminiClient.setModel(model);

        if (success) {
            res.json({ success: true, model });
        } else {
            res.status(400).json({ success: false, error: `Failed to set model to ${model}` });
        }
    } catch (e: any) {
        console.error('[Server] Set model failed:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

app.post('/gemini/upload', async (req, res) => {
    try {
        const body = req.body;
        let filesToUpload: string[] = [];

        // 1. Handle new "files" array
        if (body.files && Array.isArray(body.files)) {
            for (const f of body.files) {
                if (typeof f === 'string') {
                    filesToUpload.push(f);
                } else if (typeof f === 'object') {
                    if (f.path) {
                        filesToUpload.push(f.path);
                    } else if (f.content && f.filename) {
                        const tempDir = path.join(os.tmpdir(), 'rsrch-uploads');
                        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
                        const targetPath = path.join(tempDir, f.filename);
                        fs.writeFileSync(targetPath, f.content, 'utf8');
                        filesToUpload.push(targetPath);
                    }
                }
            }
        }
        // 2. Handle legacy single file properties (filePath, content, filename)
        else if (body.filePath || body.content) {
            let targetPath = body.filePath;
            if (body.content) {
                if (!body.filename) return res.status(400).json({ error: 'Filename is required when providing content' });
                const tempDir = path.join(os.tmpdir(), 'rsrch-uploads');
                if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
                targetPath = path.join(tempDir, body.filename);
                fs.writeFileSync(targetPath, body.content, 'utf8');
            }
            if (targetPath) filesToUpload.push(targetPath);
        }

        if (filesToUpload.length === 0) {
            return res.status(400).json({ error: 'No valid files provided' });
        }

        if (!geminiClient) {
            console.log('[Server] Creating Gemini client for upload...');
            if (!client.isBrowserInitialized()) await client.init();
            geminiClient = await client.createGeminiClient();
            await geminiClient.init();
        }

        console.log(`[Server] Uploading ${filesToUpload.length} files to Gemini...`);
        const result = await geminiClient.uploadFiles(filesToUpload);

        if (result) {
            res.json({ success: true, count: filesToUpload.length, paths: filesToUpload });
        } else {
            res.status(500).json({ success: false, error: 'Upload process failed' });
        }

    } catch (e: any) {
        console.error('[Server] Upload failed:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

// Chat endpoint
// Chat endpoint
app.post('/gemini/chat', async (req, res) => {
    try {
        const { message, sessionId, waitForResponse, model, files } = req.body;
        if (!message) return res.status(400).json({ error: 'Message is required' });

        // Windmill Proxy
        const { getWindmillClient } = await import('./windmill-client');
        const windmill = getWindmillClient();

        const useWindmill = process.env.USE_WINDMILL !== 'false';

        if (useWindmill && windmill.isConfigured() && !shouldBypass(req.headers)) {
            console.log(`[Server] Routing chat to Windmill: "${message.substring(0, 50)}..."`);
            const job = await windmill.triggerGeminiChat(message, sessionId, waitForResponse);

            if (!job.success) {
                return res.status(500).json({ success: false, error: job.error });
            }

            // If async requested without streaming, return job ID only
            if (!waitForResponse && req.headers.accept !== 'text/event-stream') {
                return res.json({
                    success: true,
                    data: {
                        jobId: job.jobId,
                        status: 'queued',
                        message: 'Request queued on Windmill'
                    }
                });
            }

            // Wait for job result (including for SSE - Windmill doesn't support real streaming)
            console.log(`[Server] Waiting for Windmill job ${job.jobId}...`);
            const result = await windmill.waitForJob(job.jobId, 120000); // 2 min timeout
            console.log(`[Server] Windmill result:`, JSON.stringify(result).substring(0, 500));

            // Handle SSE mode - send result as stream events
            if (req.headers.accept === 'text/event-stream') {
                res.setHeader('Content-Type', 'text/event-stream');
                res.setHeader('Cache-Control', 'no-cache');
                res.setHeader('Connection', 'keep-alive');

                if (result.success === false || (result.result && !result.result.success)) {
                    const errorMsg = result.result?.error || result.error || 'Unknown Windmill error';
                    res.write(`data: ${JSON.stringify({ type: 'error', error: errorMsg })}\n\n`);
                } else {
                    const scriptResult = result.result || result;
                    res.write(`data: ${JSON.stringify({ type: 'result', response: scriptResult.response, sessionId: scriptResult.session_id })}\n\n`);
                }
                res.end();
                return;
            }

            // Non-SSE blocking wait (JSON response)
            const scriptResult2 = result.result || result;
            if (!scriptResult2 || !scriptResult2.success) {
                throw new Error(scriptResult2?.error || 'Unknown Windmill error');
            }

            return res.json({ success: true, data: { response: scriptResult2.response, sessionId: scriptResult2.session_id } });
        }

        // Fallback to Local Execution
        if (!geminiClient) {
            geminiClient = await client.createGeminiClient();
            await geminiClient.init();
        }

        if (sessionId) {
            await geminiClient.openSession(sessionId);
        }

        console.log(`[Server] Gemini chat (Local): "${message.substring(0, 50)}..." (Wait: ${waitForResponse})`);

        if (req.headers.accept === 'text/event-stream') {
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');

            const response = await geminiClient.sendMessage(message, {
                onProgress: (text: string) => {
                    res.write(`data: ${JSON.stringify({ type: 'progress', text })}\n\n`);
                },
                model,
                files
            });

            res.write(`data: ${JSON.stringify({ type: 'result', response, sessionId: geminiClient.getCurrentSessionId() })}\n\n`);
            res.end();
            return;
        }

        const response = await geminiClient.sendMessage(message, { waitForResponse, model, files });
        res.json({ success: true, data: { response, sessionId: geminiClient.getCurrentSessionId() } });
    } catch (e: any) {
        console.error('[Server] Gemini chat failed:', e);
        if (req.headers.accept === 'text/event-stream') {
            res.write(`data: ${JSON.stringify({ type: 'error', error: e.message })}\n\n`);
            res.end();
        } else {
            res.status(500).json({ success: false, error: e.message });
        }
    }
});

// Send message (alias for chat with explicit session)
// Send message (alias for chat with explicit session)
app.post('/gemini/send-message', async (req, res) => {
    try {
        const { message, sessionId, model } = req.body;
        if (!message) return res.status(400).json({ error: 'Message is required' });

        // Windmill Proxy
        const { getWindmillClient } = await import('./windmill-client');
        const windmill = getWindmillClient();

        const useWindmill = process.env.USE_WINDMILL !== 'false';

        if (useWindmill && windmill.isConfigured() && !shouldBypass(req.headers)) {
            console.log(`[Server] Routing send-message to Windmill: "${message.substring(0, 50)}..."`);
            // send-message is typically blocking by default unless specified differently, 
            // but the CLI might use this. We assume blocking for consistency with legacy, 
            // unless async flag was passed (it isn't in body here usually).
            // Actually, send-message endpoint signature in legacy doesn't take waitForResponse, 
            // it assumes blocking/wait.

            const job = await windmill.triggerGeminiChat(message, sessionId, true);

            if (!job.success) {
                return res.status(500).json({ success: false, error: job.error });
            }

            // Sync wait
            console.log(`[Server] Waiting for Windmill job ${job.jobId}...`);
            const result = await windmill.waitForJob(job.jobId);

            if (!result.success && result.result?.error) {
                throw new Error(result.result.error);
            }
            const scriptResult = result.result;
            if (!scriptResult || !scriptResult.success) {
                throw new Error(scriptResult?.error || 'Unknown Windmill error');
            }

            return res.json({ success: true, data: { response: scriptResult.response, sessionId: scriptResult.session_id } });
        }

        // Fallback
        if (!geminiClient) {
            geminiClient = await client.createGeminiClient();
            await geminiClient.init();
        }

        if (sessionId) {
            await geminiClient.openSession(sessionId);
        }

        // Send (blocking)
        console.log(`[Server] Gemini send-message (Local): "${message.substring(0, 50)}..." (Model: ${model || 'default'})`);
        const response = await geminiClient.sendMessage(message, { waitForResponse: true, model }); // Default to blocking/waiting
        res.json({ success: true, data: { response, sessionId: geminiClient.getCurrentSessionId() } });

    } catch (e: any) {
        console.error('[Server] Gemini send-message failed:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

// Open session
app.post('/gemini/open-session', async (req, res) => {
    try {
        const { sessionId } = req.body;
        if (!sessionId) return res.status(400).json({ error: 'Session ID is required' });

        if (!geminiClient) {
            geminiClient = await client.createGeminiClient();
            await geminiClient.init();
        }

        const success = await geminiClient.openSession(sessionId);
        res.json({ success, sessionId: geminiClient.getCurrentSessionId() });
    } catch (e: any) {
        console.error('[Server] Gemini open-session failed:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

// Sync conversations to FalkorDB
app.post('/gemini/sync-conversations', async (req, res) => {
    try {
        const { limit = 10, offset = 0, async = false } = req.body;
        const wantsSSE = req.headers.accept?.includes('text/event-stream');

        if (!geminiClient) {
            geminiClient = await client.createGeminiClient();
            await geminiClient.init();
        }

        // --- 1. Immediate Return (Async Mode) ---
        if (async && !wantsSSE) {
            const job = await graphStore.addJob('syncConversations', `limit:${limit}, offset:${offset}`, { limit, offset });

            // Execute in background
            (async () => {
                try {
                    console.log(`[Server] Background sync job ${job.id} started...`);
                    const conversations = await geminiClient!.scrapeConversations(limit, offset);
                    let synced = 0, updated = 0;
                    for (const conv of conversations) {
                        const result = await graphStore.syncConversation({
                            platform: 'gemini',
                            platformId: conv.platformId,
                            title: conv.title,
                            type: conv.type,
                            turns: conv.turns as any
                        });
                        if (result.isNew) synced++;
                        else updated++;
                    }
                    await graphStore.updateJobStatus(job.id, 'completed', { result: { synced, updated, total: conversations.length } });
                    console.log(`[Server] Background sync job ${job.id} complete.`);
                } catch (e: any) {
                    console.error(`[Server] Background sync job ${job.id} failed:`, e);
                    await graphStore.updateJobStatus(job.id, 'failed', { error: e.message });
                }
            })().catch(console.error);

            return res.json({
                success: true,
                message: 'Sync job started in background',
                jobId: job.id,
                statusUrl: `/jobs/${job.id}`
            });
        }

        // --- 2. SSE Streaming Mode ---
        if (wantsSSE) {
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            res.flushHeaders();

            const onProgress = (data: any) => {
                res.write(`data: ${JSON.stringify({ type: 'progress', ...data })}\n\n`);
            };

            console.log(`[Server] Syncing Gemini conversations (SSE, limit: ${limit}, offset: ${offset})...`);
            const conversations = await geminiClient.scrapeConversations(limit, offset, onProgress);

            let synced = 0, updated = 0;
            for (let i = 0; i < conversations.length; i++) {
                const conv = conversations[i];
                res.write(`data: ${JSON.stringify({
                    type: 'progress',
                    status: 'syncing',
                    title: conv.title,
                    current: i + 1,
                    total: conversations.length
                })}\n\n`);

                const result = await graphStore.syncConversation({
                    platform: 'gemini',
                    platformId: conv.platformId,
                    title: conv.title,
                    type: conv.type,
                    turns: conv.turns as any
                });
                if (result.isNew) synced++;
                else updated++;
            }

            console.log(`[Server] Sync complete: ${synced} new, ${updated} updated`);
            res.write(`data: ${JSON.stringify({
                type: 'result',
                success: true,
                data: { synced, updated, total: conversations.length }
            })}\n\n`);
            res.end();
            return;
        }

        // --- 3. Standard Blocking Mode ---
        console.log(`[Server] Syncing Gemini conversations (limit: ${limit}, offset: ${offset})...`);
        const conversations = await geminiClient.scrapeConversations(limit, offset);

        let synced = 0, updated = 0;
        for (const conv of conversations) {
            const result = await graphStore.syncConversation({
                platform: 'gemini',
                platformId: conv.platformId,
                title: conv.title,
                type: conv.type,
                turns: conv.turns as any
            });
            if (result.isNew) synced++;
            else updated++;
        }

        console.log(`[Server] Sync complete: ${synced} new, ${updated} updated`);
        res.json({ success: true, data: { synced, updated, total: conversations.length } });
    } catch (e: any) {
        console.error('[Server] Gemini sync-conversations failed:', e);
        if (!res.headersSent) {
            res.status(500).json({ success: false, error: e.message });
        } else {
            res.write(`data: ${JSON.stringify({ type: 'error', error: e.message })}\n\n`);
            res.end();
        }
    }
});

// Get responses from current session
app.post('/gemini/get-responses', async (req, res) => {
    try {
        const { sessionId } = req.body;

        if (!geminiClient) {
            geminiClient = await client.createGeminiClient();
            await geminiClient.init();
        }

        if (sessionId) {
            await geminiClient.openSession(sessionId);
        }

        const responses = await geminiClient.getResponses();
        res.json({ success: true, data: responses });
    } catch (e: any) {
        console.error('[Server] Gemini get-responses failed:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

// List Gems
app.get('/gemini/gems', async (req, res) => {
    try {
        if (!geminiClient) {
            geminiClient = await client.createGeminiClient();
            await geminiClient.init();
        }

        const gems = await geminiClient.listGems();
        res.json({ success: true, data: gems });
    } catch (e: any) {
        console.error('[Server] Gemini list-gems failed:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

// Open Gem
app.post('/gemini/open-gem', async (req, res) => {
    try {
        const { gemNameOrId } = req.body;
        if (!gemNameOrId) return res.status(400).json({ error: 'Gem name or ID is required' });

        if (!geminiClient) {
            geminiClient = await client.createGeminiClient();
            await geminiClient.init();
        }

        const success = await geminiClient.openGem(gemNameOrId);
        res.json({ success });
    } catch (e: any) {
        console.error('[Server] Gemini open-gem failed:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

// Chat with Gem
app.post('/gemini/chat-gem', async (req, res) => {
    try {
        const { gemNameOrId, message } = req.body;
        if (!gemNameOrId) return res.status(400).json({ error: 'Gem name or ID is required' });
        if (!message) return res.status(400).json({ error: 'Message is required' });

        if (!geminiClient) {
            geminiClient = await client.createGeminiClient();
            await geminiClient.init();
        }

        const response = await geminiClient.chatWithGem(gemNameOrId, message);
        res.json({ success: true, data: { response } });
    } catch (e: any) {
        console.error('[Server] Gemini chat-gem failed:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

// List Research Docs
app.post('/gemini/list-research-docs', async (req, res) => {
    try {
        const { sessionId, limit } = req.body;
        const limitNum = typeof limit === 'number' ? limit : 10;

        if (!geminiClient) {
            geminiClient = await client.createGeminiClient();
            await geminiClient.init();
        }

        let docs: any[] = [];
        if (sessionId) {
            console.log(`[Server] Listing research docs for session: ${sessionId}`);
            await geminiClient.openSession(sessionId);
            docs = await geminiClient.getAllResearchDocsInSession();
        } else {
            console.log(`[Server] Listing research docs (limit ${limitNum})...`);
            docs = await geminiClient.listDeepResearchDocuments(limitNum);
        }

        res.json({ success: true, data: docs });
    } catch (e: any) {
        console.error('[Server] Gemini list-research-docs failed:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

// Unified Unified Research to Podcast Endpoint
app.post('/research-to-podcast', async (req, res) => {
    try {
        const { query, customPrompt, dryRun } = req.body;

        if (!query) return res.status(400).json({ error: 'Query is required' });

        const job = await graphStore.addJob('research-to-podcast', query, { customPrompt, dryRun });

        console.log(`[Server] Starting Unified Research Job ${job.id} for: "${query}"`);

        res.status(202).json({
            success: true,
            message: 'Unified research flow started',
            jobId: job.id,
            statusUrl: `/jobs/${job.id}`
        });

        // Async Processing
        (async () => {
            try {
                await graphStore.updateJobStatus(job.id, 'running');
                notifyJobCompleted(job.id, 'Unified Flow Started', query, true, 'Starting automated research pipeline...');

                // Get registry instance
                const registry = getRegistry();

                // 1. Perplexity Research (Fast, Grounded)
                console.log(`[Job ${job.id}] Step 1: Perplexity Research`);
                const pxResult = await client.query(query, { deepResearch: false }); // Use standard for speed/grounding

                if (!pxResult || !pxResult.answer) {
                    throw new Error('Perplexity query returned no answer.');
                }
                console.log(`[Job ${job.id}] Perplexity answer length: ${pxResult.answer.length}`);

                // 2. Gemini Deep Research (Reasoning + Synthesis)
                console.log(`[Job ${job.id}] Step 2: Gemini Deep Research`);
                if (!geminiClient) {
                    geminiClient = await client.createGeminiClient();
                    await geminiClient.init();
                }

                // Register session in artifact registry
                const geminiSessionId = geminiClient.getCurrentSessionId() || 'unknown';
                const sessionId = registry.registerSession(geminiSessionId, query);
                console.log(`[Job ${job.id}] Registered session: ${sessionId}`);

                const combinedQuery = `
Please perform a generic Deep Research on the topic: "${query}".

I have already gathered some initial findings from another source (Perplexity):
"""
${pxResult.answer}
"""

Please use your Deep Research capabilities to expand on this, verify the information, and produce a comprehensive, well-structured research report. 
Focus on depth, nuance, and covering aspects that might be missing above.
`;
                await geminiClient.research(combinedQuery);

                // 3. Export to Google Docs
                console.log(`[Job ${job.id}] Step 3: Export to Google Docs`);
                // Short wait for generation to ensure export button is ready handled in exportToGoogleDocs logic
                const exportResult = await geminiClient.exportCurrentToGoogleDocs();
                const { docTitle, docUrl, docId: googleDocId } = exportResult;

                if (!docTitle) {
                    throw new Error('Failed to export Gemini research to Google Docs (Title not captured).');
                }
                console.log(`[Job ${job.id}] Exported Doc: "${docTitle}" (${docUrl})`);

                // Register document in artifact registry
                const docId = registry.registerDocument(sessionId, googleDocId || 'unknown', docTitle);
                console.log(`[Job ${job.id}] Registered document: ${docId}`);

                // Rename Google Doc with registry ID prefix
                if (googleDocId) {
                    const newDocTitle = `${docId} ${docTitle}`;
                    await geminiClient.renameGoogleDoc(googleDocId, newDocTitle);
                    registry.updateTitle(docId, newDocTitle);
                }

                // 4. NotebookLM Setup
                console.log(`[Job ${job.id}] Step 4: NotebookLM Import`);
                if (!notebookClient) {
                    notebookClient = await client.createNotebookClient();
                }

                // Create dedicated notebook
                // Sanitize title
                const safeTitle = query.replace(/[^a-zA-Z0-9 ]/g, '').substring(0, 50).trim() || 'Research Podcast';
                await notebookClient.createNotebook(safeTitle);

                // Add Source - use the new renamed title if available
                const sourceDocTitle = googleDocId ? `${docId} ${docTitle}` : docTitle;
                await notebookClient.addSourceFromDrive([sourceDocTitle]);

                // 5. Generate Audio Overview
                console.log(`[Job ${job.id}] Step 5: Audio Generation`);
                // 5. Generate Audio Overview
                console.log(`[Job ${job.id}] Step 5: Audio Generation`);
                const audioPrompt = customPrompt || "Create a deep, engaging conversation about this research. Focus on the most surprising findings and the implications.";

                const genResult = await notebookClient.generateAudioOverview(safeTitle, undefined, audioPrompt, true, dryRun);
                const generatedTitle = genResult.artifactTitle || 'Audio Overview'; // Fallback if no new artifact detected (shouldn't happen in clean run)

                // 6. Download Audio
                if (!dryRun) {
                    console.log(`[Job ${job.id}] Step 6: Download Audio`);

                    // Register audio in artifact registry
                    const audioId = registry.registerAudio(docId, safeTitle, 'Audio Overview');
                    const cleanFilename = `${audioId}.mp3`;

                    // Download the specific artifact we just generated
                    // If generatedTitle is different from "Audio Overview", downloadAudio needs to find it.
                    // downloadAudio currently takes title pattern or latest. 
                    // If we pass the exact title as pattern, it should work.
                    await notebookClient.downloadAudio(safeTitle, cleanFilename, { audioTitlePattern: generatedTitle });

                    registry.updateLocalPath(audioId, cleanFilename);
                    console.log(`[Job ${job.id}] Audio saved to: ${cleanFilename}`);

                    // Rename audio artifact in NotebookLM to match registry ID
                    const newAudioTitle = `${audioId} Audio Overview`;
                    if (generatedTitle !== newAudioTitle) {
                        await notebookClient.renameArtifact(generatedTitle, newAudioTitle);
                    }
                } else {
                    console.log(`[Job ${job.id}] Step 6: Skipped Download (Dry Run)`);
                }

                await graphStore.updateJobStatus(job.id, 'completed', { result: { docTitle, docUrl, audioGenerated: true, sessionId, docId } });
                notifyJobCompleted(job.id, 'Unified Flow Completed', query, true, `Podcast generated for "${query}". Doc: ${docTitle}`);

            } catch (err: any) {
                console.error(`[Job ${job.id}] Failed:`, err);
                await graphStore.updateJobStatus(job.id, 'failed', { error: err.message });
                notifyJobCompleted(job.id, 'Unified Flow Failed', query, false, err.message);
            }
        })();

    } catch (e: any) {
        console.error('[Server] Unified research request failed:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('SIGTERM received, closing browser...');
    await flushObservability();
    await shutdownObservability();
    await client.close();
    process.exit(0);
});

process.on('SIGINT', async () => {
    console.log('SIGINT received, closing browser...');
    await flushObservability();
    await shutdownObservability();
    await client.close();
    process.exit(0);
});

// Start server
export async function startServer(port: number = PORT) {
    try {
        // Configure notifications
        configureNotifications({
            ntfy: config.notifications.ntfy,
            discord: { webhookUrl: config.notifications.discordWebhookUrl! }
        });

        // Try to connect browser, but don't fail startup if unavailable
        console.log('Initializing Perplexity client (browser connection)...');
        try {
            await client.init();
            console.log('[Server] Browser connected successfully.');
        } catch (browserError: any) {
            console.warn(`[Server] Browser not available at startup: ${browserError.message}`);
            console.warn('[Server] Browser will connect lazily on first request.');
        }

        // Connect to graph store (optional - can run without it)
        console.log('[Server] Connecting to FalkorDB...');
        const graphHost = config.falkor.host;
        const graphPort = config.falkor.port;
        try {
            await graphStore.connect(graphHost, graphPort);
            console.log('[Server] FalkorDB connected successfully.');

            // Check for interrupted jobs
            const runningJobs = await graphStore.listJobs('running');
            if (runningJobs.length > 0) {
                console.warn(`[Server] Found ${runningJobs.length} interrupted jobs from previous session.`);
                for (const job of runningJobs) {
                    const msg = 'Interrupted by server restart/crash.';
                    await graphStore.updateJobStatus(job.id, 'failed', { error: msg });
                    console.log(`[Server] Marked job ${job.id} as failed.`);
                    notifyJobCompleted(job.id, `${job.type} (Interrupted)`, job.query, false, msg);
                }
            }
        } catch (graphError: any) {
            console.warn(`[Server] FalkorDB not available: ${graphError.message}`);
            console.warn('[Server] Job queue and graph features will be disabled.');
        }

        const server = app.listen(port, '0.0.0.0', () => {
            console.log(`\n✓ Perplexity Researcher server running on http://localhost:${port}`);
            console.log(`\nEndpoints:`);
            console.log(`  GET  /health             - Health check`);
            console.log(`  POST /query              - Submit a query`);
            console.log(`\nOpenAI-Compatible API:`);
            console.log(`  GET  /v1/models          - List models (gemini-rsrch, perplexity)`);
            console.log(`  POST /v1/chat/completions - Chat completions`);
            console.log(`\nExample usage:`);
            console.log(`  curl -X POST http://localhost:${port}/v1/chat/completions \\`);
            console.log(`       -H "Content-Type: application/json" \\`);
            console.log(`       -d '{"model":"gemini-rsrch","messages":[{"role":"user","content":"Hello!"}]}'`);
            console.log();
        });

        return server;
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}


// Check if run directly
if (require.main === module) {
    startServer();
}
