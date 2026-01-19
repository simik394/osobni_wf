import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GraphStore } from '../src/graph-store';

// Mock FalkorDB
const mockQuery = vi.fn();

vi.mock('falkordb', () => {
    return {
        FalkorDB: {
            connect: () => Promise.resolve({
                selectGraph: () => ({
                    query: mockQuery
                }),
                close: vi.fn()
            })
        }
    };
});

describe('GraphStore Sync', () => {
    let store: GraphStore;

    beforeEach(() => {
        store = new GraphStore();
        mockQuery.mockReset();
        // Setup default success response
        mockQuery.mockResolvedValue({
            data: [],
            resultConsumedAfter: 0
        });
    });

    it('should create Gemini session', async () => {
        await store.connect();
        await store.createGeminiSession({
            sessionId: 'test-session',
            query: 'hello',
            state: 'active'
        });

        // Find the call that contains 'GeminiSession'
        const call = mockQuery.mock.calls.find(c => c[0].includes('GeminiSession'));
        expect(call).toBeDefined();
        if (call) {
            expect(call[1].params.sessionId).toBe('test-session');
            expect(call[1].params.state).toBe('active');
        }
    });

    it('should create AudioGeneration', async () => {
        await store.connect();
        await store.createAudioGeneration({
            notebookId: 'nb-1',
            status: 'pending'
        });

        const call = mockQuery.mock.calls.find(c => c[0].includes('AudioGeneration'));
        expect(call).toBeDefined();
        if (call) {
            expect(call[1].params.notebookId).toBe('nb-1');
            expect(call[1].params.status).toBe('pending');
        }
    });

    it('should create DeepResearch', async () => {
        await store.connect();
        await store.createDeepResearch({
            jobId: 'job-1',
            query: 'deep thought',
            status: 'queued'
        });

        const call = mockQuery.mock.calls.find(c => c[0].includes('DeepResearch'));
        expect(call).toBeDefined();
        if (call) {
            expect(call[1].params.jobId).toBe('job-1');
            expect(call[1].params.query).toBe('deep thought');
        }
    });

    it('should cleanup orphans', async () => {
        await store.connect();
        mockQuery.mockClear(); // Clear initSchema queries

        // Return count 5 for both calls
        mockQuery.mockResolvedValue({ data: [[5]] });

        const result = await store.cleanupOrphans();

        // Should query for AudioGeneration and DeepResearch (2 calls)
        expect(mockQuery).toHaveBeenCalledTimes(2);
        expect(result.cleaned).toBe(10);
    });
});
