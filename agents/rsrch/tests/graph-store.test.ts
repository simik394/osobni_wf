import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { GraphStore } from '../src/graph-store';

describe('GraphStore', () => {
    let store: GraphStore;

    beforeAll(async () => {
        store = new GraphStore('rsrch_test_vitest');
        try {
            await store.connect('localhost', 6379);
        } catch (e) {
            console.warn('⚠️ FalkorDB not available at localhost:6379. Skipping tests.');
        }
    });

    afterAll(async () => {
        if (store.getIsConnected()) {
            await store.disconnect();
        }
    });

    const runIfConnected = () => (store && store.getIsConnected() ? it : it.skip);

    runIfConnected()('should add and retrieve a job', async () => {
        const job = await store.addJob('query', 'What is AI?', { deep: true });
        expect(job.id.length).toBe(8);
        expect(job.status).toBe('queued');

        const retrieved = await store.getJob(job.id);
        expect(retrieved).not.toBeNull();
        expect(retrieved?.id).toBe(job.id);
        expect(retrieved?.query).toBe('What is AI?');
    });

    runIfConnected()('should update job status', async () => {
        const job = await store.addJob('query', 'Status test');
        await store.updateJobStatus(job.id, 'running');

        const updated = await store.getJob(job.id);
        expect(updated?.status).toBe('running');
        expect(updated?.startedAt).toBeDefined();

        await store.updateJobStatus(job.id, 'completed', { result: { ok: true } });
        const completed = await store.getJob(job.id);
        expect(completed?.status).toBe('completed');
        expect(completed?.result).toEqual({ ok: true });
    });

    runIfConnected()('should add and find entities', async () => {
        const entityId = `topic-${Date.now()}`;
        await store.addEntity({
            id: entityId,
            type: 'Topic',
            name: 'Artificial Intelligence',
            properties: { domain: 'tech' }
        });

        const entities = await store.findEntities('Topic');
        const found = entities.find(e => e.id === entityId);
        expect(found).toBeDefined();
        expect(found?.name).toBe('Artificial Intelligence');
    });

    runIfConnected()('should manage relationships', async () => {
        const id1 = `e1-${Date.now()}`;
        const id2 = `e2-${Date.now()}`;

        await store.addEntity({ id: id1, type: 'Test', name: 'Entity 1', properties: {} });
        await store.addEntity({ id: id2, type: 'Test', name: 'Entity 2', properties: {} });

        await store.addRelationship({ from: id1, to: id2, type: 'RELATES_TO' });

        const related = await store.findRelated(id1, 'RELATES_TO');
        expect(related.some(e => e.id === id2)).toBe(true);
    });

    runIfConnected()('should sync notebooks', async () => {
        const platformId = `nb-${Date.now()}`;
        const result = await store.syncNotebook({
            platformId,
            title: 'Test Notebook',
            url: 'https://example.com'
        });

        expect(result.id).toBe(`nb_${platformId}`);
        expect(result.isNew).toBe(true);

        const resync = await store.syncNotebook({
            platformId,
            title: 'Updated Notebook'
        });
        expect(resync.isNew).toBe(false);
    });

    runIfConnected()('should sync conversations', async () => {
        const platformId = `conv-${Date.now()}`;
        const result = await store.syncConversation({
            platformId,
            platform: 'gemini',
            title: 'Test Conversation',
            turns: [{ role: 'user', content: 'Hi', timestamp: Date.now() }]
        });

        expect(result.id).toBe(`conv_${platformId}`);
        expect(result.isNew).toBe(true);
    });

    runIfConnected()('should store facts with source', async () => {
        const sourceId = `src-${Date.now()}`;
        // Create a dummy node with this ID first
        await store.addEntity({ id: sourceId, type: 'Source', name: 'Test Source', properties: {} });

        await store.storeFact('The sky is blue', sourceId, { certainty: 1.0 });
        // Ideally we verify this with a query, but for now we just ensure no error
    });

    runIfConnected()('should add citations', async () => {
        const targetId = `target-${Date.now()}`;
        await store.addEntity({ id: targetId, type: 'Fact', name: 'Fact 1', properties: {} });

        await store.addCitation({
            url: 'https://example.com/source',
            title: 'Example Source',
            domain: 'example.com'
        }, targetId);
    });
});
