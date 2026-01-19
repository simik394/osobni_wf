import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkflowEngine } from '../src/workflows/engine';
import { PerplexityClient } from '../src/client';
import { getGraphStore } from '../src/graph-store';

// Mock dependencies
vi.mock('../src/client');
vi.mock('../src/graph-store');

describe('WorkflowEngine', () => {
    let engine: WorkflowEngine;
    let mockClient: any;
    let mockGraphStore: any;

    beforeEach(() => {
        // Setup mocks
        mockClient = {
            createGeminiClient: vi.fn().mockResolvedValue({
                init: vi.fn(),
                sendMessage: vi.fn().mockResolvedValue('Mock Gemini Response'),
                startDeepResearch: vi.fn().mockResolvedValue({ status: 'completed' }),
                getCurrentSessionId: vi.fn().mockReturnValue('mock-session-id'),
                exportCurrentToGoogleDocs: vi.fn().mockResolvedValue({ docId: '123', docUrl: 'http://doc' })
            }),
            createNotebookClient: vi.fn().mockResolvedValue({
                openNotebook: vi.fn(),
                createNotebook: vi.fn(),
                addSourceUrl: vi.fn(),
                query: vi.fn().mockResolvedValue('Mock Notebook Response'),
                generateAudioOverview: vi.fn().mockResolvedValue({ success: true, artifactTitle: 'Audio' })
            }),
            query: vi.fn().mockResolvedValue(undefined),
            close: vi.fn()
        };

        mockGraphStore = {
            connect: vi.fn(),
            createWorkflowExecution: vi.fn(),
            updateWorkflowExecution: vi.fn(),
            updateStepExecution: vi.fn()
        };

        (getGraphStore as any).mockReturnValue(mockGraphStore);

        engine = new WorkflowEngine(mockClient as unknown as PerplexityClient);

        // Manually load a mock workflow for testing without file system
        (engine as any).workflows.set('test-workflow', {
            name: 'test-workflow',
            steps: [
                {
                    id: 'step1',
                    agent: 'gemini',
                    action: 'query',
                    params: { query: 'Hello ${inputs.name}' }
                },
                {
                    id: 'step2',
                    agent: 'perplexity',
                    action: 'query',
                    params: { query: 'Follow up' },
                    dependsOn: ['step1']
                }
            ]
        });
    });

    it('should execute a simple workflow', async () => {
        const result = await engine.execute('test-workflow', { name: 'World' });

        expect(result.status).toBe('completed');
        expect(mockClient.createGeminiClient).toHaveBeenCalled();
        expect(mockGraphStore.createWorkflowExecution).toHaveBeenCalled();
        // running + completed for each step (2 steps) = 4 calls
        expect(mockGraphStore.updateStepExecution).toHaveBeenCalledTimes(4);
    });

    it('should resolve dependencies and interpolate params', async () => {
        await engine.execute('test-workflow', { name: 'World' });

        // Check params interpolation
        // First call to gemini should be "Hello World"
        const geminiClient = await mockClient.createGeminiClient();
        expect(geminiClient.sendMessage).toHaveBeenCalledWith('Hello World');
    });

    it('should handle interpolation of step results and properties', async () => {
         (engine as any).workflows.set('chain-workflow', {
            name: 'chain-workflow',
            steps: [
                {
                    id: 'step1',
                    agent: 'gemini',
                    action: 'query',
                    params: { query: 'Start' }
                },
                {
                    id: 'step2',
                    agent: 'gemini',
                    action: 'query',
                    params: {
                        // Test implicit string conversion and property access
                        query: 'Result: ${steps.step1} Session: ${steps.step1.sessionId}'
                    },
                    dependsOn: ['step1']
                }
            ]
        });

        await engine.execute('chain-workflow');
        const geminiClient = await mockClient.createGeminiClient();
        // step1 calls sendMessage('Start') -> returns 'Mock Gemini Response', sessionId 'mock-session-id'
        // step2 query should be: 'Result: Mock Gemini Response Session: mock-session-id'

        expect(geminiClient.sendMessage).toHaveBeenCalledWith('Result: Mock Gemini Response Session: mock-session-id');
    });
});
