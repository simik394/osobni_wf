import express from 'express';
import { PerplexityClient } from './client';
import { config } from './config';

import { NotebookLMClient } from './notebooklm-client';
import { GeminiClient } from './gemini-client';
import { getGraphStore, GraphJob } from './graph-store';
import { notifyJobCompleted } from './discord';
import { getRegistry } from './artifact-registry';

// Initialize graph store
const graphStore = getGraphStore();

const app = express();
const PORT = config.port;

// Middleware
app.use(express.json());

// Initialize the client
const client = new PerplexityClient();
let notebookClient: NotebookLMClient | null = null;

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
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

app.post('/notebook/generate-audio', async (req, res) => {
    try {
        const { notebookTitle, sources, customPrompt, dryRun } = req.body;

        if (!notebookClient) {
            notebookClient = await client.createNotebookClient();
        }

        // Check if busy
        if (notebookClient?.isBusy) {
            return res.status(409).json({ success: false, error: 'NotebookLM client is busy with another task.' });
        }

        // Create Job using centralized queue
        const job = await graphStore.addJob('audio-generation', notebookTitle || 'default', { sources, customPrompt, dryRun });

        // Start background processing
        console.log(`[Server] Starting async job ${job.id}: Audio Generation (DryRun: ${dryRun})`);

        (async () => {
            try {
                await graphStore.updateJobStatus(job.id, 'running');
                await notebookClient!.generateAudioOverview(notebookTitle, sources, customPrompt, true, dryRun);
                await graphStore.updateJobStatus(job.id, 'completed', { result: { message: 'Audio generated' } });
                console.log(`[Server] Job ${job.id} completed.`);
                notifyJobCompleted(job.id, 'Audio Generation', notebookTitle || 'default', true, 'Audio overview generated');
            } catch (err: any) {
                console.error(`[Server] Job ${job.id} failed:`, err);
                await graphStore.updateJobStatus(job.id, 'failed', { error: err.message });
                notifyJobCompleted(job.id, 'Audio Generation', notebookTitle || 'default', false, err.message);
            }
        })();

        res.status(202).json({
            success: true,
            message: 'Audio generation started',
            jobId: job.id,
            statusUrl: `/jobs/${job.id}`
        });

    } catch (e: any) {
        console.error('[Server] Generate audio request failed:', e);
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
                id: 'perplexity',
                object: 'model' as const,
                created: Math.floor(Date.now() / 1000),
                owned_by: 'rsrch'
            }
        ]
    };
    res.json(models);
});

// Chat completions endpoint
app.post('/v1/chat/completions', async (req, res) => {
    try {
        const request = req.body as ChatCompletionRequest;

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

        // Extract the last user message
        const userMessages = request.messages.filter(m => m.role === 'user');
        if (userMessages.length === 0) {
            return res.status(400).json({
                error: {
                    message: 'No user message found in request',
                    type: 'invalid_request_error',
                    code: 400
                }
            });
        }
        const prompt = userMessages[userMessages.length - 1].content;

        console.log(`[OpenAI API] Chat completion request: "${prompt.substring(0, 50)}..."`);

        let responseText: string;
        const model = request.model || 'gemini-rsrch';

        // Route to appropriate backend based on model
        if (model === 'perplexity' || model.includes('perplexity')) {
            // Use Perplexity
            console.log('[OpenAI API] Using Perplexity backend');
            const result = await client.query(prompt, { deepResearch: false });
            responseText = result?.answer || 'No response';
        } else {
            // Use Gemini (default)
            console.log('[OpenAI API] Using Gemini backend');
            if (!geminiClient) {
                console.log('[OpenAI API] Creating Gemini client...');
                geminiClient = await client.createGeminiClient();
                await geminiClient.init();
            }
            responseText = await geminiClient.research(prompt);
        }

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
                prompt_tokens: 0,
                completion_tokens: 0,
                total_tokens: 0
            }
        };

        console.log(`[OpenAI API] Response ready (${responseText.length} chars)`);
        res.json(response);

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

        if (!geminiClient) {
            console.log('[Server] Creating Gemini client...');
            geminiClient = await client.createGeminiClient();
            await geminiClient.init();
        }

        console.log(`[Server] Generating Gemini response for: "${query}"`);
        const response = await geminiClient.research(query);

        res.json({ success: true, data: response });
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
                const audioPrompt = customPrompt || "Create a deep, engaging conversation about this research. Focus on the most surprising findings and the implications.";

                await notebookClient.generateAudioOverview(safeTitle, undefined, audioPrompt, true, dryRun);

                // 6. Download Audio
                if (!dryRun) {
                    console.log(`[Job ${job.id}] Step 6: Download Audio`);

                    // Register audio in artifact registry
                    const audioId = registry.registerAudio(docId, safeTitle, 'Audio Overview');
                    const cleanFilename = `${audioId}.mp3`;

                    await notebookClient.downloadAudio(safeTitle, cleanFilename);
                    registry.updateLocalPath(audioId, cleanFilename);
                    console.log(`[Job ${job.id}] Audio saved to: ${cleanFilename}`);

                    // Rename audio artifact in NotebookLM
                    const newAudioTitle = `${audioId} Audio Overview`;
                    await notebookClient.renameArtifact('Audio Overview', newAudioTitle);
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
    await client.close();
    process.exit(0);
});

process.on('SIGINT', async () => {
    console.log('SIGINT received, closing browser...');
    await client.close();
    process.exit(0);
});

// Start server
export async function startServer() {
    try {
        console.log('Initializing Perplexity client...');
        await client.init();

        // Connect to graph store
        console.log('[Server] Connecting to FalkorDB...');
        const graphHost = process.env.FALKORDB_HOST || 'localhost';
        await graphStore.connect(graphHost, 6379);

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

        app.listen(PORT, () => {
            console.log(`\n✓ Perplexity Researcher server running on http://localhost:${PORT}`);
            console.log(`\nEndpoints:`);
            console.log(`  GET  /health             - Health check`);
            console.log(`  POST /query              - Submit a query`);
            console.log(`\nOpenAI-Compatible API:`);
            console.log(`  GET  /v1/models          - List models (gemini-rsrch, perplexity)`);
            console.log(`  POST /v1/chat/completions - Chat completions`);
            console.log(`\nExample usage:`);
            console.log(`  curl -X POST http://localhost:${PORT}/v1/chat/completions \\`);
            console.log(`       -H "Content-Type: application/json" \\`);
            console.log(`       -d '{"model":"gemini-rsrch","messages":[{"role":"user","content":"Hello!"}]}'`);
            console.log();
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}


// Check if run directly
if (require.main === module) {
    startServer();
}
