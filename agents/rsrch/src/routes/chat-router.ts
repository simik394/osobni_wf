import { Router, Request, Response } from 'express';
import { GEMINI_API_ROUTES } from '@agents/shared';
import { GeminiClient } from '../clients/gemini';
import { BrowserClient } from '../clients/base';
import { config } from '../config';
import { 
    startChatCompletionTrace, 
    completeChatCompletionTrace, 
    failChatCompletionTrace, 
    estimateTokens 
} from '../services/observability';

// --- Types ---
export interface ChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export interface ChatCompletionRequest {
    model: string;
    messages: ChatMessage[];
    temperature?: number;
    max_tokens?: number;
    stream?: boolean;
    session?: string;
    session_id?: string;
}

export interface ChatCompletionResponse {
    id: string;
    object: 'chat.completion';
    created: number;
    model: string;
    choices: any[];
    usage: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
    session?: string;
}

// --- Helpers ---
function generateId(): string {
    return 'chatcmpl-' + Math.random().toString(36).substring(2, 15);
}

function formatConversation(messages: ChatMessage[]): string {
    return messages
        .map(m => `${m.role.charAt(0).toUpperCase() + m.role.slice(1)}: ${m.content}`)
        .join('\n\n---\n\n');
}

function validateMessages(messages: ChatMessage[]): string | null {
    if (!messages || messages.length === 0) return 'Messages array cannot be empty';
    const validRoles = ['user', 'assistant', 'system'];
    for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];
        if (!msg.role || !validRoles.includes(msg.role)) return `Invalid role at index ${i}`;
        if (typeof msg.content !== 'string') return `Content at index ${i} must be string`;
        if (msg.content.trim() === '') return `Content at index ${i} cannot be empty`;
    }
    if (!messages.some(m => m.role === 'user')) return 'At least one user message is required';
    return null;
}

// --- Router Factory ---
export function createChatRouter(deps: { 
    browserClient: BrowserClient,
    getGeminiClient: () => Promise<GeminiClient>,
    proxyChatCompletion?: any,
    shouldBypass?: (headers: any) => boolean
}) {
    const router = Router();
    const { browserClient, getGeminiClient, proxyChatCompletion, shouldBypass } = deps;

    router.get('/models', (req, res) => {
        res.json({
            object: 'list',
            data: [
                { id: 'gemini-rsrch', object: 'model', created: Math.floor(Date.now() / 1000), owned_by: 'rsrch' },
                { id: 'perplexity', object: 'model', created: Math.floor(Date.now() / 1000), owned_by: 'rsrch' }
            ]
        });
    });

    router.post('/chat/completions', async (req, res) => {
        try {
            const request = req.body as ChatCompletionRequest;

            // Proxy to Windmill if configured
            if (proxyChatCompletion && config.windmill?.token && shouldBypass && !shouldBypass(req.headers)) {
                try {
                    const result = await proxyChatCompletion('rsrch', request);
                    return res.json(result);
                } catch (e: any) {
                    console.warn('[ChatRouter] Windmill proxy failed, falling back...');
                }
            }

            const validationError = validateMessages(request.messages);
            if (validationError) return res.status(400).json({ error: { message: validationError } });

            const prompt = formatConversation(request.messages);
            const model = request.model || 'gemini-rsrch';
            const traceCtx = startChatCompletionTrace(request);

            if (request.stream) {
                if (model.includes('perplexity')) return res.status(501).json({ error: { message: 'Streaming not supported for Perplexity' } });
                
                res.setHeader('Content-Type', 'text/event-stream');
                res.flushHeaders();
                
                const id = generateId();
                const created = Math.floor(Date.now() / 1000);
                const gemini = await getGeminiClient();
                
                const sendSSE = (data: any) => res.write(`data: ${data === '[DONE]' ? '[DONE]' : JSON.stringify(data)}\n\n`);

                try {
                    await gemini.researchWithStreaming(prompt, (chunk) => {
                        sendSSE({
                            id, object: 'chat.completion.chunk', created, model,
                            choices: [{ index: 0, delta: chunk.content ? { content: chunk.content } : { role: 'assistant' }, finish_reason: chunk.isComplete ? 'stop' : null }]
                        });
                        if (chunk.isComplete) sendSSE('[DONE]');
                    }, { sessionId: request.session || request.session_id });
                    res.end();
                } catch (e: any) {
                    sendSSE({ id, object: 'chat.completion.chunk', created, model, choices: [{ index: 0, delta: { content: `[Error: ${e.message}]` }, finish_reason: 'stop' }] });
                    sendSSE('[DONE]');
                    res.end();
                }
                return;
            }

            // Non-streaming
            let responseText = '';
            if (model.includes('perplexity')) {
                const result = await browserClient.query(prompt, { sessionId: request.session_id, sessionName: request.session });
                responseText = result?.answer || 'No response';
            } else {
                const gemini = await getGeminiClient();
                responseText = (await gemini.research(prompt, { sessionId: request.session || request.session_id, resetSession: !request.session && !request.session_id })) || '';
            }

            completeChatCompletionTrace(traceCtx, responseText);
            res.json({
                id: generateId(), object: 'chat.completion', created: Math.floor(Date.now() / 1000), model,
                choices: [{ index: 0, message: { role: 'assistant', content: responseText }, finish_reason: 'stop' }],
                usage: { prompt_tokens: estimateTokens(prompt), completion_tokens: estimateTokens(responseText), total_tokens: estimateTokens(prompt) + estimateTokens(responseText) },
                session: request.session || request.session_id
            });
        } catch (error: any) {
            console.error('[ChatRouter] Failed:', error);
            res.status(500).json({ error: { message: error.message } });
        }
    });

    return router;
}

export function createGeminiRouter(deps: { getGeminiClient: () => Promise<GeminiClient> }) {
    const router = Router();
    const { getGeminiClient } = deps;

    router.post('/chat', async (req: Request, res: Response) => {
        try {
            const { message, sessionId, model, files } = req.body;
            if (!message) return res.status(400).json({ error: 'Message is required' });

            const gemini = await getGeminiClient();
            const wantsSSE = req.headers.accept?.includes('text/event-stream');

            if (wantsSSE) {
                res.setHeader('Content-Type', 'text/event-stream');
                res.flushHeaders();
                const handler = (data: any) => res.write(`data: ${JSON.stringify(data)}\n\n`);
                gemini.on('progress', handler);
                try {
                    const response = await gemini.sendMessage(message, { ...req.body });
                    res.write(`data: ${JSON.stringify({ type: 'result', success: true, data: response })}\n\n`);
                    res.end();
                } finally {
                    gemini.removeListener('progress', handler);
                }
            } else {
                const response = await gemini.sendMessage(message, { ...req.body });
                res.json({ success: true, data: response });
            }
        } catch (e: any) {
            console.error('[GeminiRouter] Chat failed:', e);
            res.status(500).json({ error: e.message });
        }
    });

    router.post('/research', async (req: Request, res: Response) => {
        try {
            const { query } = req.body;
            if (!query) return res.status(400).json({ error: 'Query is required' });

            const gemini = await getGeminiClient();
            const wantsSSE = req.headers.accept?.includes('text/event-stream');

            if (wantsSSE) {
                res.setHeader('Content-Type', 'text/event-stream');
                res.flushHeaders();
                const handler = (data: any) => res.write(`data: ${JSON.stringify(data)}\n\n`);
                gemini.on('progress', handler);
                try {
                    const response = await gemini.research(query, { deepResearch: false, ...req.body });
                    res.write(`data: ${JSON.stringify({ type: 'result', success: true, data: response })}\n\n`);
                    res.end();
                } finally {
                    gemini.removeListener('progress', handler);
                }
            } else {
                const response = await gemini.research(query, { deepResearch: false, ...req.body });
                res.json({ success: true, data: response });
            }
        } catch (e: any) {
            console.error('[GeminiRouter] Research failed:', e);
            res.status(500).json({ error: e.message });
        }
    });

    router.get('/gems', async (req: Request, res: Response) => {
        try {
            const gemini = await getGeminiClient();
            const gems = await gemini.listGems();
            res.json({ success: true, data: gems });
        } catch (e: any) {
            console.error('[GeminiRouter] listGems failed:', e);
            res.status(500).json({ error: e.message });
        }
    });

    router.get(`/${GEMINI_API_ROUTES.INFO}`, async (req: Request, res: Response) => {
        try {
            const gemini = await getGeminiClient();
            const info = await gemini.getResearchInfo();
            res.json({
                success: true,
                data: {
                    ...info,
                    isReady: !!gemini.page
                }
            });
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    });

    router.get(`/${GEMINI_API_ROUTES.SESSIONS}`, async (req: Request, res: Response) => {
        try {
            const { limit, offset, query, pinnedOnly, strategy } = req.query;
            const gemini = await getGeminiClient();
            const sessions = await gemini.listSessions({
                limit: limit ? parseInt(limit as string) : undefined,
                offset: offset ? parseInt(offset as string) : undefined,
                query: query as string,
                pinnedOnly: pinnedOnly === 'true',
                strategy: strategy as any
            });
            res.json({ success: true, data: sessions });
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    });

    router.get(`/${GEMINI_API_ROUTES.RESPONSES}`, async (req: Request, res: Response) => {
        try {
            const { sessionId } = req.query;
            const gemini = await getGeminiClient();
            if (sessionId) {
                await gemini.openSession(sessionId as string);
            }
            const responses = await gemini.getResponses();
            res.json({ success: true, data: responses });
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    });

    router.get(`/${GEMINI_API_ROUTES.RESEARCH_DOCS}`, async (req: Request, res: Response) => {
        try {
            const { limit, sessionId } = req.query;
            const gemini = await getGeminiClient();
            const docs = sessionId 
                ? await gemini.getAllResearchDocsInSession()
                : await gemini.listDeepResearchDocuments(limit ? parseInt(limit as string) : undefined);
            res.json({ success: true, data: docs });
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    });

    router.get('/research/doc/:index', async (req: Request, res: Response) => {
        try {
            const index = parseInt(req.params.index);
            const gemini = await getGeminiClient();
            const doc = await gemini.readDeepResearchDocument(index);
            res.json({ success: true, data: doc });
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    });

    router.post(`/${GEMINI_API_ROUTES.SESSION_PIN}`, async (req: Request, res: Response) => {
        try {
            const { sessionId } = req.body;
            const gemini = await getGeminiClient();
            const success = await gemini.pinSession(sessionId);
            res.json({ success });
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    });

    router.post(`/${GEMINI_API_ROUTES.SESSION_UNPIN}`, async (req: Request, res: Response) => {
        try {
            const { sessionId } = req.body;
            const gemini = await getGeminiClient();
            const success = await gemini.unpinSession(sessionId);
            res.json({ success });
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    });

    // --- Canvas Actions ---
    router.get(`/${GEMINI_API_ROUTES.CANVAS_LIST}`, async (req: Request, res: Response) => {
        try {
            const gemini = await getGeminiClient();
            const artifacts = await gemini.listArtifacts();
            res.json({ success: true, data: artifacts });
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    });

    router.get(`/${GEMINI_API_ROUTES.CANVAS_READ}`, async (req: Request, res: Response) => {
        try {
            const gemini = await getGeminiClient();
            const content = await gemini.readCanvas();
            res.json({ success: true, data: content });
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    });

    router.post(`/${GEMINI_API_ROUTES.CANVAS_OPEN}`, async (req: Request, res: Response) => {
        try {
            const { name } = req.body;
            const gemini = await getGeminiClient();
            const success = await gemini.openArtifact(name);
            res.json({ success });
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    });

    router.post(`/${GEMINI_API_ROUTES.CANVAS_UPDATE}`, async (req: Request, res: Response) => {
        try {
            const { content, mode } = req.body;
            const gemini = await getGeminiClient();
            const success = await gemini.updateCanvas(content, { mode });
            res.json({ success });
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    });

    router.post(`/${GEMINI_API_ROUTES.CANVAS_TAB}`, async (req: Request, res: Response) => {
        try {
            const { tab } = req.body;
            const gemini = await getGeminiClient();
            const success = await gemini.switchCanvasTab(tab);
            res.json({ success });
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    });

    router.post(`/${GEMINI_API_ROUTES.CANVAS_CLOSE}`, async (req: Request, res: Response) => {
        try {
            const gemini = await getGeminiClient();
            const success = await gemini.closeCanvas();
            res.json({ success });
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    });

    router.get(`/${GEMINI_API_ROUTES.CANVAS_VERSIONS}`, async (req: Request, res: Response) => {
        try {
            const gemini = await getGeminiClient();
            const versions = await gemini.listCanvasVersions();
            res.json({ success: true, data: versions });
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    });

    router.post(`/${GEMINI_API_ROUTES.CANVAS_RESTORE}`, async (req: Request, res: Response) => {
        try {
            const { versionId } = req.body;
            const gemini = await getGeminiClient();
            const success = await gemini.restoreCanvasVersion(versionId);
            res.json({ success });
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    });

    router.post(`/${GEMINI_API_ROUTES.CANVAS_PROMPT}`, async (req: Request, res: Response) => {
        try {
            const { instruction } = req.body;
            const gemini = await getGeminiClient();
            const success = await gemini.promptCanvas(instruction);
            res.json({ success });
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    });

    router.post(`/${GEMINI_API_ROUTES.CANVAS_EXPORT}`, async (req: Request, res: Response) => {
        try {
            const { target } = req.body;
            const gemini = await getGeminiClient();
            const success = await gemini.exportCanvas(target);
            res.json({ success });
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    });

    router.post(`/${GEMINI_API_ROUTES.SESSION_RENAME}`, async (req: Request, res: Response) => {
        try {
            const { sessionId, newName } = req.body;
            const gemini = await getGeminiClient();
            const success = await gemini.renameSession(newName, sessionId);
            res.json({ success });
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    });

    router.post(`/${GEMINI_API_ROUTES.SESSION_DELETE}`, async (req: Request, res: Response) => {
        try {
            const { sessionId } = req.body;
            const gemini = await getGeminiClient();
            const success = await gemini.deleteSession(sessionId);
            res.json({ success });
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    });

    router.post('/environment/deep-research', async (req: Request, res: Response) => {
        try {
            const { enabled } = req.body;
            const gemini = await getGeminiClient();
            const success = await gemini.toggleDeepResearch(enabled);
            res.json({ success });
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    });

    router.get('/environment/extensions', async (req: Request, res: Response) => {
        try {
            const gemini = await getGeminiClient();
            const extensions = await gemini.listExtensions();
            res.json({ success: true, data: extensions });
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    });

    router.post('/environment/toggle-extension', async (req: Request, res: Response) => {
        try {
            const { name, enabled } = req.body;
            const gemini = await getGeminiClient();
            const success = await gemini.toggleExtension(name, enabled);
            res.json({ success });
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    });

    router.post('/chat/feedback', async (req: Request, res: Response) => {
        try {
            const { isGood, comment } = req.body;
            const gemini = await getGeminiClient();
            const success = await gemini.submitFeedback(isGood, comment);
            res.json({ success });
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    });

    router.post('/chat/edit', async (req: Request, res: Response) => {
        try {
            const { newText } = req.body;
            const gemini = await getGeminiClient();
            const success = await gemini.editLastPrompt(newText);
            res.json({ success });
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    });

    router.post('/canvas/archive', async (req: Request, res: Response) => {
        try {
            const { outputDir, format, incremental } = req.body;
            const gemini = await getGeminiClient();
            const files = await gemini.archiveArtifacts({ outputDir, format, incremental });
            res.json({ success: true, data: files });
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    });

    router.post('/canvas/audio-overview', async (req: Request, res: Response) => {
        try {
            const { artifactId, notebookTitle, customPrompt } = req.body;
            const gemini = await getGeminiClient();
            const result = await gemini.researchToAudio({ artifactId, notebookTitle, customPrompt });
            res.json(result);
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    });

    router.post('/gems/create', async (req: Request, res: Response) => {
        try {
            const { name, instructions } = req.body;
            const gemini = await getGeminiClient();
            const id = await gemini.createGem({ name, instructions });
            res.json({ success: true, id });
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    });

    router.post('/gems/update', async (req: Request, res: Response) => {
        try {
            const { id, name, instructions } = req.body;
            const gemini = await getGeminiClient();
            const success = await gemini.updateGem(id, { name, instructions });
            res.json({ success });
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    });

    router.post('/gems/delete', async (req: Request, res: Response) => {
        try {
            const { id } = req.body;
            const gemini = await getGeminiClient();
            const success = await gemini.deleteGem(id);
            res.json({ success });
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    });

    router.post('/gems/chat', async (req: Request, res: Response) => {
        try {
            const { nameOrId, message } = req.body;
            const gemini = await getGeminiClient();
            const response = await gemini.chatWithGem(nameOrId, message);
            res.json({ success: true, data: response });
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    });

    router.post('/session/open', async (req: Request, res: Response) => {
        try {
            const { identifier } = req.body;
            const gemini = await getGeminiClient();
            const success = await gemini.openSession(identifier);
            if (success) {
                const sessionId = await gemini.getCurrentSessionId();
                res.json({ success: true, sessionId });
            } else {
                res.json({ success: false });
            }
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    });

    router.post('/session/load-history', async (req: Request, res: Response) => {
        try {
            const { limit, untilText } = req.body;
            const gemini = await getGeminiClient();
            await gemini.scrollToTop({ limit, untilText });
            res.json({ success: true });
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    });

    router.post('/session/share', async (req: Request, res: Response) => {
        try {
            const gemini = await getGeminiClient();
            const link = await gemini.shareSession();
            res.json({ success: true, link });
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    });

    router.post('/session/export', async (req: Request, res: Response) => {
        try {
            const { sessionId } = req.body;
            const gemini = await getGeminiClient();
            if (sessionId) {
                await gemini.openSession(sessionId);
            }
            const data = await gemini.exportSession();
            res.json({ success: true, data });
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    });

    router.get(`/${GEMINI_API_ROUTES.MODEL_STATUS}`, async (req: Request, res: Response) => {
        try {
            const gemini = await getGeminiClient();
            const statuses = await gemini.getModelStatus();
            res.json({ success: true, data: statuses });
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    });

    router.post('/gemini/upload', async (req: Request, res: Response) => {
        try {
            const { files } = req.body;
            const gemini = await getGeminiClient();
            
            const fs = await import('node:fs');
            const path = await import('node:path');
            const os = await import('node:os');
            const crypto = await import('node:crypto');

            const tmpDir = path.join(os.tmpdir(), `gemini-upload-${crypto.randomBytes(4).toString('hex')}`);
            fs.mkdirSync(tmpDir, { recursive: true });

            const tempPaths = [];
            for (const f of files) {
                const tmpPath = path.join(tmpDir, f.filename);
                if (f.encoding === 'base64') {
                    fs.writeFileSync(tmpPath, Buffer.from(f.content, 'base64'));
                } else {
                    fs.writeFileSync(tmpPath, f.content);
                }
                tempPaths.push(tmpPath);
            }

            const count = await gemini.uploadFiles(tempPaths);

            // Cleanup temp files
            fs.rmSync(tmpDir, { recursive: true, force: true });

            res.json({ success: true, count });
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    });

    router.post('/gemini/export-to-docs', async (req: Request, res: Response) => {
        try {
            const gemini = await getGeminiClient();
            const result = await gemini.exportCurrentToGoogleDocs();
            res.json({ success: true, data: result });
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    });

    router.post('/gemini/upload-repo', async (req: Request, res: Response) => {
        try {
            const { repoUrl, sessionId, branch } = req.body;
            const gemini = await getGeminiClient();
            
            if (sessionId) await gemini.openSession(sessionId);

            const { RepoLoader } = await import('../core/repo-loader');
            const loader = new RepoLoader();
            
            console.log(`[Server] Processing repository: ${repoUrl}`);
            const contextFile = await loader.loadRepoAsFile(repoUrl, { branch });
            
            const count = await gemini.uploadFiles([contextFile]);
            
            // Cleanup temp file
            const fs = await import('node:fs');
            if (fs.existsSync(contextFile)) fs.unlinkSync(contextFile);

            res.json({ success: true, count });
        } catch (e: any) {
            console.error('[Server] upload-repo failed:', e);
            res.status(500).json({ error: e.message });
        }
    });

    router.post('/gemini/upload-drive', async (req: Request, res: Response) => {
        try {
            const { fileName } = req.body;
            const gemini = await getGeminiClient();
            const success = await gemini.uploadFromDrive(fileName);
            res.json({ success });
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    });

    router.post('/gemini/upload-notebooklm', async (req: Request, res: Response) => {
        try {
            const { notebookTitle } = req.body;
            const gemini = await getGeminiClient();
            const success = await gemini.uploadFromNotebookLM(notebookTitle);
            res.json({ success });
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    });

    router.post('/gemini/upload-photos', async (req: Request, res: Response) => {
        try {
            const { photoTitle } = req.body;
            const gemini = await getGeminiClient();
            const success = await gemini.uploadFromPhotos(photoTitle);
            res.json({ success });
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    });

    router.post('/gemini/draft-to-gmail', async (req: Request, res: Response) => {
        try {
            const gemini = await getGeminiClient();
            const result = await gemini.draftCurrentToGmail();
            res.json(result);
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    });

    router.get('/gemini/sharing/links', async (req: Request, res: Response) => {
        try {
            const gemini = await getGeminiClient();
            const links = await gemini.listSharedLinks();
            res.json({ success: true, links });
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    });

    router.post('/gemini/sharing/delete', async (req: Request, res: Response) => {
        try {
            const { linkIdOrTitle } = req.body;
            const gemini = await getGeminiClient();
            const success = await gemini.deleteSharedLink(linkIdOrTitle);
            res.json({ success });
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    });

    router.post('/gemini/sharing/delete-all', async (req: Request, res: Response) => {
        try {
            const gemini = await getGeminiClient();
            const success = await gemini.deleteAllSharedLinks();
            res.json({ success });
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    });

    router.post('/environment/deep-research', async (req: Request, res: Response) => {
        try {
            const { enabled } = req.body;
            const gemini = await getGeminiClient();
            const success = await gemini.toggleDeepResearch(enabled);
            res.json({ success });
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    });

    router.get('/environment/extensions', async (req: Request, res: Response) => {
        try {
            const gemini = await getGeminiClient();
            const extensions = await gemini.listExtensions();
            res.json({ success: true, data: extensions });
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    });

    router.post('/environment/toggle-extension', async (req: Request, res: Response) => {
        try {
            const { name, enabled } = req.body;
            const gemini = await getGeminiClient();
            const success = await gemini.toggleExtension(name, enabled);
            res.json({ success });
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    });

    router.get(`/${GEMINI_API_ROUTES.MODEL_STATUS}`, async (req: Request, res: Response) => {
        try {
            const gemini = await getGeminiClient();
            const statuses = await gemini.getModelStatus();
            res.json({ success: true, data: statuses });
        } catch (e: any) {
            console.error('[GeminiRouter] getModelStatus failed:', e);
            res.status(500).json({ error: e.message });
        }
    });

    router.post('/environment/set-model', async (req: Request, res: Response) => {
        try {
            const { model } = req.body;
            if (!model) return res.status(400).json({ error: 'model is required' });

            const gemini = await getGeminiClient();
            const success = await gemini.setModel(model);
            res.json({ success });
        } catch (e: any) {
            console.error('[GeminiRouter] setModel failed:', e);
            res.status(500).json({ error: e.message });
        }
    });

    router.post('/session/extract', async (req: Request, res: Response) => {
        try {
            const gemini = await getGeminiClient();
            const data = await gemini.extractCurrentConversation();
            res.json({ success: true, data });
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    });

    router.post('/session/scrape', async (req: Request, res: Response) => {
        try {
            const { limit, offset } = req.body;
            const gemini = await getGeminiClient();
            let count = 0;
            await gemini.scrapeConversations(limit, offset, (p) => { count++; });
            res.json({ success: true, count });
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    });

    router.post('/session/sync', async (req: Request, res: Response) => {
        try {
            const { limit = 10 } = req.body;
            const gemini = await getGeminiClient();
            const { getGraphStore } = await import('../core/graph-store');
            const store = getGraphStore();
            
            let count = 0;
            await gemini.scrapeConversations(limit, 0, async (conv) => {
                await store.syncConversation({
                    id: conv.id,
                    platform: 'gemini',
                    title: conv.title,
                    turns: conv.turns
                });
                count++;
            });
            
            res.json({ success: true, count });
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    });

    router.get('/status', async (req: Request, res: Response) => {
        res.json({ success: true, status: 'ok' });
    });

    return router;
}
