
import { describe, test, expect, beforeAll, vi } from 'vitest';
import { KnowledgeBase } from '../src/knowledge';
import path from 'path';

describe('Structured Knowledge (Lessons Learned)', () => {
    const fixturePath = path.join(__dirname, 'fixtures', 'LESSONS_LEARNED_TEST.md');
    // Mock FalkorClient
    const mockClient = {
        query: vi.fn().mockResolvedValue([]),
    };

    let kb: KnowledgeBase;

    beforeAll(() => {
        // @ts-ignore
        kb = new KnowledgeBase(mockClient);
    });

    test('syncFromMarkdown should parse file and update graph', async () => {
        await kb.syncFromMarkdown(fixturePath);

        // Verify parse logic invocations
        expect(mockClient.query).toHaveBeenCalledTimes(2); // One per topic

        // Check first call arguments
        const firstCall = mockClient.query.mock.calls[0];
        const cypher = firstCall[0];
        const params = firstCall[1];

        expect(params.topic).toBe('Test Topic');
        expect(params.problem).toBe('This is a test problem description.');
        expect(params.solution).toBe('This is a test solution.');

        // Verify Cypher syntax (brief check)
        expect(cypher).toContain('MERGE (p:Problem');
        expect(cypher).toContain('MERGE (s:Solution');
    });
});
