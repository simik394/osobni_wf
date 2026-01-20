import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ArtifactRegistry } from '../src/artifact-registry';
import * as fs from 'fs';
import * as path from 'path';

const TEST_DIR = 'data/test-registry-vitest';
const TEST_FILE = path.join(TEST_DIR, 'artifact-registry.json');

describe('ArtifactRegistry', () => {
    let registry: ArtifactRegistry;

    beforeEach(() => {
        if (fs.existsSync(TEST_FILE)) {
            fs.unlinkSync(TEST_FILE);
        }
        if (fs.existsSync(TEST_DIR)) {
            fs.rmdirSync(TEST_DIR, { recursive: true });
        }
        registry = new ArtifactRegistry(TEST_DIR);
    });

    afterEach(() => {
        if (fs.existsSync(TEST_FILE)) {
            fs.unlinkSync(TEST_FILE);
        }
        if (fs.existsSync(TEST_DIR)) {
            fs.rmdirSync(TEST_DIR, { recursive: true });
        }
    });

    it('should generate unique 3-character base IDs', () => {
        const ids = new Set<string>();
        for (let i = 0; i < 100; i++) {
            ids.add(registry.generateBaseId());
        }
        expect(ids.size).toBe(100);
        expect([...ids][0].length).toBe(3);
    });

    it('should register and retrieve a session', () => {
        const sessionId = registry.registerSession('gemini-session-abc', 'History of Espresso');
        expect(sessionId.length).toBe(3);

        const session = registry.get(sessionId);
        expect(session).toBeDefined();
        expect(session?.type).toBe('session');
        expect(session?.query).toBe('History of Espresso');
    });

    it('should register and retrieve a document', () => {
        const sessionId = registry.registerSession('s1', 'Q1');
        const docId = registry.registerDocument(sessionId, 'gdoc-123', 'Deep Research on Coffee');

        expect(docId).toMatch(/^[A-Z0-9]{3}-\d{2}$/);
        expect(docId.startsWith(sessionId)).toBe(true);

        const doc = registry.get(docId);
        expect(doc).toBeDefined();
        expect(doc?.type).toBe('document');
        expect(doc?.parentId).toBe(sessionId);
    });

    it('should register and retrieve audio with incrementing suffixes', () => {
        const sessionId = registry.registerSession('s1', 'Q1');
        const docId = registry.registerDocument(sessionId, 'd1', 'title');

        const audioId1 = registry.registerAudio(docId, 'Notebook', 'Overview 1');
        const audioId2 = registry.registerAudio(docId, 'Notebook', 'Overview 2');

        expect(audioId1).toMatch(/^[A-Z0-9]{3}-\d{2}-A$/);
        expect(audioId2).toMatch(/^[A-Z0-9]{3}-\d{2}-B$/);

        const audio = registry.get(audioId1);
        expect(audio).toBeDefined();
        expect(audio?.type).toBe('audio');
    });

    it('should track lineage correctly', () => {
        const sessionId = registry.registerSession('s1', 'Q1');
        const docId = registry.registerDocument(sessionId, 'd1', 'D1');
        const audioId = registry.registerAudio(docId, 'N1', 'A1');

        const lineage = registry.getLineage(audioId);
        expect(lineage.length).toBe(3);
        expect(lineage[0].type).toBe('audio');
        expect(lineage[1].type).toBe('document');
        expect(lineage[2].type).toBe('session');
    });

    it('should persist data to disk', () => {
        const sessionId = registry.registerSession('s1', 'Persist Test');

        const registry2 = new ArtifactRegistry(TEST_DIR);
        registry2.load();

        const session = registry2.get(sessionId);
        expect(session).toBeDefined();
        expect(session?.query).toBe('Persist Test');
    });

    it('should list artifacts by type', () => {
        const s1 = registry.registerSession('s1', 'Q1');
        registry.registerDocument(s1, 'd1', 'D1');
        registry.registerAudio('s1-01', 'N1', 'A1');

        expect(registry.listByType('session').length).toBe(1);
        expect(registry.listByType('document').length).toBe(1);
        expect(registry.listByType('audio').length).toBe(1);
    });
});
