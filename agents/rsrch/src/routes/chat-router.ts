import { Router, Request, Response } from 'express';
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

    router.get('/info', async (req: Request, res: Response) => {
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

    router.get('/status', async (req: Request, res: Response) => {
        res.json({ success: true, status: 'ok' });
    });

    return router;
}
