import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createAgent, getAllAgents, setBrowserClient } from '../../src/agents';
import { GeminiAgent } from '../../src/agents/gemini-agent';
import { PerplexityAgent } from '../../src/agents/perplexity-agent';
import { NotebookLMAgent } from '../../src/agents/notebooklm-agent';

describe('Research Agents', () => {

    beforeEach(() => {
        // Create fresh mocks for each test
        const mockGeminiClientObj = {
            init: vi.fn().mockResolvedValue(undefined),
            research: vi.fn().mockResolvedValue('Gemini content'),
            researchWithGem: vi.fn().mockResolvedValue('Gemini Gem content'),
            getCurrentSessionId: vi.fn().mockReturnValue('gemini-session-1'),
            parseResearch: vi.fn().mockResolvedValue({
                citations: [
                    { id: 1, text: 'Source 1', url: 'https://example.com/1', domain: 'example.com' }
                ]
            }),
            listSessions: vi.fn().mockResolvedValue([
                { id: 'sess-1', name: 'Session 1' }
            ])
        };

        const mockNotebookClientObj = {
            init: vi.fn().mockResolvedValue(undefined),
            query: vi.fn().mockResolvedValue('Notebook content'),
            listNotebooks: vi.fn().mockResolvedValue([
                { title: 'Notebook 1', platformId: 'nb-1', sourceCount: 5 }
            ]),
            addSourceUrl: vi.fn().mockResolvedValue(undefined)
        };

        const mockQueryResponse = {
            answer: 'Perplexity answer',
            sources: [
                { index: 1, title: 'Source 1', url: 'https://example.com/p1' }
            ],
            url: 'https://perplexity.ai/search/123',
            timestamp: '2023-01-01'
        };

        const mockClientInstance = {
            init: vi.fn().mockResolvedValue(undefined),
            isBrowserInitialized: vi.fn().mockReturnValue(true),
            createGeminiClient: async () => mockGeminiClientObj,
            createNotebookClient: async () => mockNotebookClientObj,
            query: async () => mockQueryResponse,
            close: vi.fn().mockResolvedValue(undefined)
        };

        setBrowserClient(mockClientInstance as any);
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('Factory', () => {
        it('should create agents by type', () => {
            expect(createAgent('gemini')).toBeInstanceOf(GeminiAgent);
            expect(createAgent('perplexity')).toBeInstanceOf(PerplexityAgent);
            expect(createAgent('notebooklm')).toBeInstanceOf(NotebookLMAgent);
        });

        it('should return all agents', () => {
            const agents = getAllAgents();
            expect(agents).toHaveLength(3);
            expect(agents[0]).toBeInstanceOf(GeminiAgent);
            expect(agents[1]).toBeInstanceOf(PerplexityAgent);
            expect(agents[2]).toBeInstanceOf(NotebookLMAgent);
        });
    });

    describe('Gemini Agent', () => {
        it('should execute query', async () => {
            const agent = createAgent('gemini');
            const result = await agent.query('test prompt');

            expect(result.content).toBe('Gemini content');
            expect(result.id).toBe('gemini-session-1');
            expect(result.citations).toHaveLength(1);
            expect(result.citations![0].text).toBe('Source 1');
        });

        it('should execute query with gem', async () => {
            const agent = createAgent('gemini');
            const result = await agent.query('test prompt', { gem: 'MyGem' });

            expect(result.content).toBe('Gemini Gem content');
            expect(result.metadata?.gem).toBe('MyGem');
        });
    });

    describe('Perplexity Agent', () => {
        it('should execute query', async () => {
            const agent = createAgent('perplexity');
            const result = await agent.query('test prompt');

            expect(result.content).toBe('Perplexity answer');
            expect(result.citations).toHaveLength(1);
            expect(result.citations![0].url).toBe('https://example.com/p1');
        });
    });

    describe('NotebookLM Agent', () => {
        it('should execute query', async () => {
            const agent = createAgent('notebooklm');
            const result = await agent.query('test prompt');

            expect(result.content).toBe('Notebook content');
            expect(result.id).toBe('notebooklm-session');
        });

        it('should list sessions (notebooks)', async () => {
            const agent = createAgent('notebooklm');
            const sessions = await agent.listSessions();

            expect(sessions).toHaveLength(1);
            expect(sessions[0].name).toBe('Notebook 1');
            expect(sessions[0].id).toBe('nb-1');
        });
    });
});
