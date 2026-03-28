/**
 * Exporter module tests
 * Tests markdown export, JSON export, content hashing, and file export.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
    exportToMarkdown,
    exportToJson,
    computeContentHash,
    exportToFile,
    type ExportConversation,
    type ExportOptions,
} from '../src/exporter';

const TEST_OUTPUT_DIR = '/tmp/rsrch-test-exports';

const sampleConversation: ExportConversation = {
    platform: 'gemini',
    platformId: 'test-conv-123',
    title: 'Test Research Conversation',
    type: 'regular',
    turns: [
        { role: 'user', content: 'What is quantum computing?', timestamp: 1700000000000 },
        { role: 'assistant', content: 'Quantum computing is a type of computation...', timestamp: 1700000001000 },
        { role: 'user', content: 'How does it differ from classical computing?', timestamp: 1700000002000 },
        { role: 'assistant', content: 'The key difference is...', timestamp: 1700000003000 },
    ],
    capturedAt: 1700000010000,
    createdAt: 1700000000000,
};

const deepResearchConversation: ExportConversation = {
    platform: 'gemini',
    platformId: 'deep-research-456',
    title: 'Deep Research: AI Ethics',
    type: 'deep-research',
    turns: [
        { role: 'user', content: 'Research AI ethics implications', timestamp: 1700000000000 },
        { role: 'assistant', content: 'Here is my research...', timestamp: 1700000001000, thinking: 'I should explore multiple perspectives...' },
    ],
    researchDocs: [
        {
            title: 'AI Ethics Overview',
            content: 'A comprehensive review of AI ethics...',
            sources: [
                { id: 1, text: 'Stanford HAI Report', url: 'https://hai.stanford.edu/report', domain: 'hai.stanford.edu' },
                { id: 2, text: 'EU AI Act Summary', url: 'https://ec.europa.eu/ai-act', domain: 'ec.europa.eu' },
            ],
            reasoningSteps: [
                { phase: 'Research', action: 'Searched for academic papers on AI ethics' },
                { phase: 'Synthesis', action: 'Combined findings from multiple sources' },
            ],
        },
    ],
    capturedAt: 1700000010000,
};

describe('Exporter', () => {

    afterEach(() => {
        if (fs.existsSync(TEST_OUTPUT_DIR)) {
            fs.rmSync(TEST_OUTPUT_DIR, { recursive: true });
        }
    });

    describe('computeContentHash', () => {
        it('should produce a 16-char hex hash', () => {
            const hash = computeContentHash(sampleConversation);
            expect(hash).toMatch(/^[0-9a-f]{16}$/);
        });

        it('should produce same hash for same content', () => {
            const hash1 = computeContentHash(sampleConversation);
            const hash2 = computeContentHash(sampleConversation);
            expect(hash1).toBe(hash2);
        });

        it('should produce different hashes for different content', () => {
            const modified = { ...sampleConversation, turns: [...sampleConversation.turns, { role: 'user' as const, content: 'extra', timestamp: 0 }] };
            const hash1 = computeContentHash(sampleConversation);
            const hash2 = computeContentHash(modified);
            expect(hash1).not.toBe(hash2);
        });
    });

    describe('exportToMarkdown', () => {
        it('should produce valid markdown with YAML frontmatter', () => {
            const md = exportToMarkdown(sampleConversation);
            expect(md).toContain('---');
            expect(md).toContain('platform: gemini');
            expect(md).toContain('sessionId: test-conv-123');
            expect(md).toContain('type: regular');
            expect(md).toContain('# Test Research Conversation');
        });

        it('should include all conversation turns', () => {
            const md = exportToMarkdown(sampleConversation);
            expect(md).toContain('### User');
            expect(md).toContain('### Assistant');
            expect(md).toContain('What is quantum computing?');
            expect(md).toContain('Quantum computing is a type of computation...');
        });

        it('should include research documents for deep research', () => {
            const md = exportToMarkdown(deepResearchConversation, { includeResearchDocs: true });
            expect(md).toContain('## Research Documents');
            expect(md).toContain('### AI Ethics Overview');
            expect(md).toContain('Stanford HAI Report');
            expect(md).toContain('Sources Used');
        });

        it('should include reasoning steps', () => {
            const md = exportToMarkdown(deepResearchConversation, { includeResearchDocs: true });
            expect(md).toContain('#### Reasoning Steps');
            expect(md).toContain('**Research**');
            expect(md).toContain('Searched for academic papers');
        });

        it('should include thinking when option is set', () => {
            const md = exportToMarkdown(deepResearchConversation, { includeThinking: true });
            expect(md).toContain('#### Thinking');
            expect(md).toContain('I should explore multiple perspectives');
        });

        it('should NOT include thinking by default', () => {
            const md = exportToMarkdown(deepResearchConversation);
            expect(md).not.toContain('#### Thinking');
        });

        it('should escape quotes in title frontmatter', () => {
            const conv = { ...sampleConversation, title: 'Research "with quotes"' };
            const md = exportToMarkdown(conv);
            expect(md).toContain('title: "Research \\"with quotes\\""');
        });

        it('should include contentHash in frontmatter', () => {
            const md = exportToMarkdown(sampleConversation);
            expect(md).toMatch(/contentHash: [0-9a-f]{16}/);
        });
    });

    describe('exportToJson', () => {
        it('should produce valid JSON', () => {
            const json = exportToJson(sampleConversation);
            const parsed = JSON.parse(json);
            expect(parsed.platform).toBe('gemini');
            expect(parsed.turns.length).toBe(4);
        });

        it('should include exportedAt timestamp', () => {
            const before = Date.now();
            const json = exportToJson(sampleConversation);
            const parsed = JSON.parse(json);
            expect(parsed.exportedAt).toBeGreaterThanOrEqual(before);
        });

        it('should include contentHash', () => {
            const json = exportToJson(sampleConversation);
            const parsed = JSON.parse(json);
            expect(parsed.contentHash).toMatch(/^[0-9a-f]{16}$/);
        });
    });

    describe('exportToFile', () => {
        it('should write markdown file to disk', async () => {
            const result = await exportToFile(sampleConversation, {
                format: 'md',
                outputDir: TEST_OUTPUT_DIR,
            });

            expect(result.success).toBe(true);
            expect(fs.existsSync(result.path)).toBe(true);
            expect(result.path).toContain('.md');

            const content = fs.readFileSync(result.path, 'utf-8');
            expect(content).toContain('platform: gemini');
        });

        it('should write JSON file to disk', async () => {
            const result = await exportToFile(sampleConversation, {
                format: 'json',
                outputDir: TEST_OUTPUT_DIR,
            });

            expect(result.success).toBe(true);
            expect(result.path).toContain('.json');

            const content = JSON.parse(fs.readFileSync(result.path, 'utf-8'));
            expect(content.platform).toBe('gemini');
        });

        it('should create output directory if missing', async () => {
            const deepDir = path.join(TEST_OUTPUT_DIR, 'sub', 'deep');
            const result = await exportToFile(sampleConversation, {
                format: 'md',
                outputDir: deepDir,
            });

            expect(result.success).toBe(true);
            expect(fs.existsSync(deepDir)).toBe(true);
        });

        it('should generate safe filenames from titles', async () => {
            const conv = { ...sampleConversation, title: 'What is "AI"? A deep/dive! (2024)' };
            const result = await exportToFile(conv, {
                format: 'md',
                outputDir: TEST_OUTPUT_DIR,
            });

            expect(result.path).not.toContain('"');
            expect(result.path).not.toContain('/dive');
            expect(result.path).not.toContain('(');
        });

        it('should return contentHash', async () => {
            const result = await exportToFile(sampleConversation, {
                format: 'md',
                outputDir: TEST_OUTPUT_DIR,
            });

            expect(result.contentHash).toMatch(/^[0-9a-f]{16}$/);
        });
    });
});
