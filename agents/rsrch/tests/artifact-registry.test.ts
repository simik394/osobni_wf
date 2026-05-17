import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ArtifactRegistry } from '../src/core/artifact-registry';
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

// start snippet should-generate-unique-3-character-base-ids

    it('should generate unique 3-character base IDs', () => {
        const ids = new Set<string>();
        for (let i = 0; i < 100; i++) {
            const id = registry.generateBaseId();
            ids.add(id);
            // Register it in the registry's internal artifacts to prevent duplicate generation
            (registry as any).registry.artifacts[id] = {
                type: 'session',
                createdAt: new Date().toISOString()
            };
        }
        expect(ids.size).toBe(100);
        expect([...ids][0].length).toBe(3);
    });

// end snippet should-generate-unique-3-character-base-ids

// start snippet should-register-and-retrieve-a-session

    it('should register and retrieve a session', () => {
        const sessionId = registry.registerSession('gemini-session-abc', 'History of Espresso');
        expect(sessionId.length).toBe(3);

        const session = registry.get(sessionId);
        expect(session).toBeDefined();
        expect(session?.type).toBe('session');
        expect(session?.query).toBe('History of Espresso');
    });

// end snippet should-register-and-retrieve-a-session

// start snippet should-register-and-retrieve-a-document

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

// end snippet should-register-and-retrieve-a-document

// start snippet should-register-and-retrieve-audio-with-incrementi

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

// end snippet should-register-and-retrieve-audio-with-incrementi

// start snippet should-track-lineage-correctly

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

// end snippet should-track-lineage-correctly

// start snippet should-persist-data-to-disk

    it('should persist data to disk', () => {
        const sessionId = registry.registerSession('s1', 'Persist Test');

        const registry2 = new ArtifactRegistry(TEST_DIR);
        registry2.load();

        const session = registry2.get(sessionId);
        expect(session).toBeDefined();
        expect(session?.query).toBe('Persist Test');
    });

// end snippet should-persist-data-to-disk

    it('should list all artifacts', () => {
        const s1 = registry.registerSession('s1', 'Q1');
        registry.registerDocument(s1, 'd1', 'D1');
        
        const all = registry.listAll();
        expect(Object.keys(all).length).toBe(2);
    });

    it('should delete an artifact', () => {
        const s1 = registry.registerSession('s1', 'Q1');
        expect(registry.get(s1)).toBeDefined();
        
        registry.delete(s1);
        expect(registry.get(s1)).toBeUndefined();
    });

    it('should support provenance tracking via sourceArtifactId', () => {
        const s1 = registry.registerSession('s1', 'Q1');
        const docId = registry.registerDocument(s1, 'g1', 'G1');
        
        // Notebook source linked to Gemini doc
        const sourceId = registry.generateBaseId();
        (registry as any).registry.artifacts[sourceId] = {
            type: 'source_text',
            parentId: 'nb-1',
            originalTitle: 'G1',
            sourceArtifactId: docId,
            createdAt: new Date().toISOString()
        };
        
        const source = registry.get(sourceId);
        expect(source?.sourceArtifactId).toBe(docId);
    });
});
