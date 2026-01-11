import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';

// Hoist mocks to be accessible inside vi.mock
const mocks = vi.hoisted(() => ({
    queryStream: vi.fn(),
    monitorAudioGeneration: vi.fn(),
    researchWithStreaming: vi.fn()
}));

// Mock PerplexityClient
vi.mock('../src/client', () => {
    class MockPerplexityClient {
        queryStream = mocks.queryStream;
        init = vi.fn();
        createGeminiClient = vi.fn().mockResolvedValue({
            init: vi.fn(),
            researchWithStreaming: mocks.researchWithStreaming,
            research: vi.fn().mockResolvedValue('Research result')
        });
        createNotebookClient = vi.fn().mockResolvedValue({
            monitorAudioGeneration: mocks.monitorAudioGeneration,
            init: vi.fn(),
            checkAudioStatus: vi.fn().mockResolvedValue({ generating: false, artifactTitles: [] })
        });
        isBrowserInitialized = vi.fn().mockReturnValue(true);
        query = vi.fn();
        close = vi.fn();
    }
    return { PerplexityClient: MockPerplexityClient };
});

// Mock NotebookLMClient
vi.mock('../src/notebooklm-client', () => {
    class MockNotebookLMClient {
        monitorAudioGeneration = mocks.monitorAudioGeneration;
        init = vi.fn();
        checkAudioStatus = vi.fn().mockResolvedValue({ generating: false, artifactTitles: [] });
    }
    return { NotebookLMClient: MockNotebookLMClient };
});

// Mock GeminiClient
vi.mock('../src/gemini-client', () => {
    class MockGeminiClient {
        init = vi.fn();
        researchWithStreaming = mocks.researchWithStreaming;
        research = vi.fn().mockResolvedValue('Research result');
    }
    return { GeminiClient: MockGeminiClient };
});

// Mock GraphStore
vi.mock('../src/graph-store', () => {
    return {
        getGraphStore: vi.fn().mockReturnValue({
            getIsConnected: vi.fn().mockReturnValue(true),
            connect: vi.fn(),
            listJobs: vi.fn().mockResolvedValue([])
        })
    };
});

// Mock ArtifactRegistry
vi.mock('../src/artifact-registry', () => ({
    getRegistry: vi.fn().mockReturnValue({})
}));

// Mock Config
vi.mock('../src/config', () => ({
    config: {
        port: 3002, // Different port for tests
        falkor: { host: 'localhost', port: 6379 },
        paths: { resultsDir: './results' }
    }
}));

// Import app after mocks
import { app } from '../src/server';

describe('SSE Streaming Support', () => {

    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('Perplexity Streaming', () => {
        it('should stream response chunks in OpenAI format', async () => {
            // Setup mock to simulate streaming
            mocks.queryStream.mockImplementation(async (query, onChunk) => {
                onChunk({ content: 'Hello', isComplete: false });
                onChunk({ content: ' World', isComplete: false });
                onChunk({ content: '', isComplete: true });
                return 'Hello World';
            });

            const res = await request(app)
                .post('/v1/chat/completions')
                .send({
                    model: 'perplexity',
                    messages: [{ role: 'user', content: 'Test query' }],
                    stream: true
                });

            expect(res.status).toBe(200);
            expect(res.header['content-type']).toMatch(/text\/event-stream/);

            // Check body for SSE data format
            const body = res.text;
            expect(body).toContain('data: {');
            expect(body).toContain('"object":"chat.completion.chunk"');
            expect(body).toContain('"content":"Hello"');
            expect(body).toContain('"content":" World"');
            expect(body).toContain('data: [DONE]');
        });

        it('should include thoughts in the stream', async () => {
            mocks.queryStream.mockImplementation(async (query, onChunk) => {
                onChunk({ content: 'Answer', isComplete: false, thoughts: 'Thinking process' });
                onChunk({ content: '', isComplete: true });
                return 'Answer';
            });

            const res = await request(app)
                .post('/v1/chat/completions')
                .send({
                    model: 'perplexity',
                    messages: [{ role: 'user', content: 'Hard question' }],
                    stream: true
                });

            expect(res.text).toContain('Thinking process');
            expect(res.text).toContain('[Thoughts: Thinking process]');
        });
    });

    describe('NotebookLM Status Streaming', () => {
        it('should stream status updates via SSE', async () => {
            // Setup mock to simulate monitoring
            mocks.monitorAudioGeneration.mockImplementation(async (title, onUpdate) => {
                onUpdate({ status: 'generating', message: 'Working...' });
                onUpdate({ status: 'completed', artifact: 'Audio 1' });
            });

            const res = await request(app)
                .get('/notebook/updates?notebookTitle=TestNotebook');

            expect(res.status).toBe(200);
            expect(res.header['content-type']).toMatch(/text\/event-stream/);

            const body = res.text;
            expect(body).toContain('event: generating');
            expect(body).toContain('"message":"Working..."');
            expect(body).toContain('event: completed');
            expect(body).toContain('"artifact":"Audio 1"');
        });

        it('should handle errors during monitoring', async () => {
            mocks.monitorAudioGeneration.mockImplementation(async (title, onUpdate) => {
                throw new Error('Monitoring failed');
            });

            const res = await request(app)
                .get('/notebook/updates?notebookTitle=TestNotebook');

            expect(res.text).toContain('event: error');
            expect(res.text).toContain('Monitoring failed');
        });
    });
});
