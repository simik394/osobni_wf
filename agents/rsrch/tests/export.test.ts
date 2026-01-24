
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GeminiClient } from '../src/gemini-client';
import { createResearchMockPage } from './fixtures/mock-page-factory';
import { Page } from 'playwright';

// Mock getRegistry to avoid side effects
vi.mock('../src/artifact-registry', () => ({
    getRegistry: vi.fn().mockReturnValue({
        registerSession: vi.fn().mockReturnValue('TEST-SESSION'),
        registerDocument: vi.fn().mockReturnValue('TEST-DOC'),
        updateTitle: vi.fn(),
        get: vi.fn()
    })
}));

// Mock telemetry
vi.mock('../../shared/src', () => ({
    getRsrchTelemetry: vi.fn().mockReturnValue({
        startTrace: vi.fn(),
        startGeneration: vi.fn(),
        endGeneration: vi.fn(),
        endTrace: vi.fn(),
        trackError: vi.fn()
    })
}));

describe('Export Automation', () => {
    let mockPage: Page;
    let client: GeminiClient;

    beforeEach(() => {
        vi.clearAllMocks();
        mockPage = createResearchMockPage();
        // Enable verbose logging to troubleshoot
        client = new GeminiClient(mockPage, { verbose: false });
    });

    describe('parseResearch', () => {

// start snippet should-correctly-extract-research-data-from-dom-el
        it('should correctly extract research data from DOM elements', async () => {
            // Trigger the parse
            const result = await client.parseResearch();


            expect(result).not.toBeNull();
            if (!result) return;

            // Verify basic metadata extraction
            expect(result.query).toBe('Tell me about quantum computing');

            // Note: The extraction logic for Title falls back to various strategies.
            // Our mock provides 'Research Title' in the content headings.
            expect(result.headings).toContain('Research Title');
            expect(result.headings).toContain('Section 1');

            // Verify Content HTML extraction
            expect(result.contentHtml).toContain('<h1>Research Title</h1>');
            expect(result.contentHtml).toContain('href="https://example.com/qc"');

            // Verify Citation extraction
            expect(result.citations).toHaveLength(1);
            expect(result.citations[0]).toEqual({
                id: 1,
                text: 'quantum mechanics',
                url: 'https://example.com/qc',
                domain: 'example.com',
                usedInSections: []
            });

            // Verify Reasoning Steps
            // based on "Analyzing physics..." status message in mock
            expect(result.reasoningSteps.length).toBeGreaterThan(0);
            expect(result.reasoningSteps[0].action).toContain('Analyzing physics');
        });

// end snippet should-correctly-extract-research-data-from-dom-el

// start snippet should-generate-valid-markdown-from-parsed-structu

        it('should generate valid markdown from parsed structure', async () => {
            const result = await client.parseResearch();
            expect(result).not.toBeNull();

            // Console output for user verification
            console.log('\n--- PARSED RESULT (DEFAULT) ---');
            console.log(JSON.stringify(result, null, 2));
            console.log('-------------------------------\n');

            const markdown = client.exportToMarkdown(result!);

            // Console output for user verification
            console.log('\n--- GENERATED MARKDOWN (DEFAULT) ---');
            console.log(markdown);
            console.log('------------------------------------\n');

            // Check for key markdown elements
            // The title extraction worked, so we expect the actual title found in the mock HTML
            expect(markdown).toContain('# Research Title');
            expect(markdown).toContain('> **Query:** Tell me about quantum computing');
            expect(markdown).toContain('## Sources Used');
            expect(markdown).toContain('| 1 | [quantum mechanics](https://example.com/qc) | example.com |');
            expect(markdown).toContain('## Research Process');

            // Check content markdown conversion
            expect(markdown).toContain('# Research Title');
            expect(markdown).toContain('Quantum computing uses [quantum mechanics](https://example.com/qc).');
        });

// end snippet should-generate-valid-markdown-from-parsed-structu

// start snippet should-correctly-extract-different-research-data-t

        it('should correctly extract DIFFERENT research data to prove dynamic parsing', async () => {
            // Setup custom data
            const customPage = createResearchMockPage({
                title: 'AI History',
                query: 'Who invented neural networks?',
                contentHtml: `
                    <h1>History of AI</h1>
                    <p>The concept started with <a href="https://ai-history.com/mcculloch-pitts">McCulloch-Pitts neuron</a> in 1943.</p>
                    <div class="research-status">Searching archives...</div>
                    <h2>1943 Era</h2>
                    <p>Foundations were laid.</p>
                `,
                contentText: 'History of AI\nThe concept started with McCulloch-Pitts neuron in 1943.\nSearching archives...\n1943 Era\nFoundations were laid.',
                citations: [
                    { text: 'McCulloch-Pitts neuron', href: 'https://ai-history.com/mcculloch-pitts' }
                ],
                headings: ['History of AI', '1943 Era'],
                reasoning: ['Searching archives...']
            });

            const customClient = new GeminiClient(customPage, { verbose: false });
            const result = await customClient.parseResearch();

            expect(result).not.toBeNull();
            if (!result) return;

            // Console output for user verification
            console.log('\n--- PARSED RESULT (CUSTOM) ---');
            console.log(JSON.stringify(result, null, 2));
            console.log('------------------------------\n');

            const markdown = customClient.exportToMarkdown(result);

            // Console output for user verification
            console.log('\n--- GENERATED MARKDOWN (CUSTOM) ---');
            console.log(markdown);
            console.log('-----------------------------------\n');

            expect(result.query).toBe('Who invented neural networks?');
            expect(result.headings).toContain('History of AI');
            expect(markdown).toContain('# History of AI');
            expect(markdown).toContain('[McCulloch-Pitts neuron](https://ai-history.com/mcculloch-pitts)');
        });

// end snippet should-correctly-extract-different-research-data-t
    });

    describe('exportToMarkdown', () => {

// start snippet should-format-full-research-document-correctly
        it('should format full research document correctly', () => {
            const mockParsedData = {
                title: 'Test Research',
                query: 'Test Query',
                content: 'Some content',
                contentHtml: '<p>Some content</p>',
                contentMarkdown: 'Some content',
                headings: ['Heading 1'],
                citations: [
                    { id: 1, text: 'Source 1', url: 'http://src1.com', domain: 'src1.com', usedInSections: [] }
                ],
                reasoningSteps: [
                    { phase: 'Step 1', action: 'Thinking...' }
                ],
                researchFlow: [],
                createdAt: '2025-01-01'
            };

            const compiledMd = client.exportToMarkdown(mockParsedData);

            expect(compiledMd).toContain('# Test Research');
            expect(compiledMd).toContain('> **Query:** Test Query');
            expect(compiledMd).toContain('| 1 | [Source 1](http://src1.com) | src1.com |');
            expect(compiledMd).toContain('**Step 1**: Thinking...');
        });

// end snippet should-format-full-research-document-correctly
    });
});
