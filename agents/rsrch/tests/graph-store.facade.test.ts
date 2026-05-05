import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GraphStore, getGraphStore } from '../src/core/graph-store';

// Mock low-level dependencies
vi.mock('falkordb', () => ({
    FalkorDB: {
        connect: vi.fn().mockResolvedValue({
            selectGraph: vi.fn().mockReturnValue({
                query: vi.fn().mockResolvedValue({ data: [], statistics: {} }),
                createNodeRangeIndex: vi.fn().mockResolvedValue(undefined)
            }),
            close: vi.fn().mockResolvedValue(undefined)
        })
    }
}));

describe('GraphStore Facade (Unit)', () => {
    let store: GraphStore;

    beforeEach(() => {
        vi.clearAllMocks();
        store = new GraphStore('test-graph');
    });

    it('should connect successfully', async () => {
        await store.connect();
        expect(store.getIsConnected()).toBe(true);
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
