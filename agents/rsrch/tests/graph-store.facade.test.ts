import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GraphStore, getGraphStore } from '../src/core/graph-store';
import { FalkorDB } from 'falkordb';
import { NetworkError } from '../src/clients/errors';

// Mock low-level dependencies
vi.mock('falkordb', () => {
    const mockGraph = {
        query: vi.fn().mockResolvedValue({ data: [], statistics: {} }),
        createNodeRangeIndex: vi.fn().mockResolvedValue(undefined)
    };
    const mockClient = {
        selectGraph: vi.fn(() => mockGraph),
        close: vi.fn().mockResolvedValue(undefined)
    };
    return {
        FalkorDB: {
            connect: vi.fn(() => Promise.resolve(mockClient)),
        },
    };
});

describe('GraphStore Facade (Unit)', () => {
    let store: GraphStore;
    const mockConnect = FalkorDB.connect as vi.Mock;

    beforeEach(() => {
        vi.resetAllMocks();
        store = new GraphStore('test-graph');
        
        const mockGraph = {
            query: vi.fn().mockResolvedValue({ data: [], statistics: {} }),
            createNodeRangeIndex: vi.fn().mockResolvedValue(undefined)
        };
        const mockClient = {
            selectGraph: vi.fn(() => mockGraph),
            close: vi.fn().mockResolvedValue(undefined)
        };
        mockConnect.mockResolvedValue(mockClient);
    });

    it('should connect successfully', async () => {
        await store.connect();
        expect(store.getIsConnected()).toBe(true);
        expect(mockConnect).toHaveBeenCalledTimes(1);
    });

    it('should add a job', async () => {
        await store.connect();
        const job = await store.addJob('query', 'test-query');
        expect(job.id).toBeDefined();
        expect(job.status).toBe('queued');
    });

    it('should maintain singleton instance', () => {
        const s1 = getGraphStore();
        const s2 = getGraphStore();
        expect(s1).toBe(s2);
    });
});
