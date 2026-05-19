import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as path from 'path';
import { parseLessonsLearned } from '../src/services/lessons-parser';
import { KnowledgeBase } from '../src/core/graph-store/knowledge';
import { GraphConnection } from '../src/core/graph-store/connection';

describe('Structured Knowledge Base (Lessons Learned)', () => {
    const fixturePath = path.join(__dirname, 'fixtures', 'LESSONS_LEARNED_TEST.md');

    describe('Markdown Lessons Parser', () => {
        it('should correctly parse bracketed headers, problems, solutions, topics, and reference URLs', async () => {
            const lessons = await parseLessonsLearned(fixturePath);

            expect(lessons).toHaveLength(2);

            // Verify Playwright lesson
            const first = lessons.find(l => l.id.includes('playwright'));
            expect(first).toBeDefined();
            expect(first!.title).toBe('1. Playwright Submenu Mechanics (2026-05-18)');
            expect(first!.topics).toContain('Playwright');
            expect(first!.problem).toContain('double-pass');
            expect(first!.solution).toContain('instantly closes the menu');
            expect(first!.referenceUrl).toBe('file:///home/sim/Prods/01-pwf/agents/rsrch/src/actions/gemini/model.ts');

            // Verify Docker lesson
            const second = lessons.find(l => l.id.includes('docker'));
            expect(second).toBeDefined();
            expect(second!.title).toBe('2. Docker Memory Limit Resets');
            expect(second!.topics).toContain('Docker');
            expect(second!.problem).toContain('crash on halvarm server');
            expect(second!.solution).toContain('proper memory limits');
            expect(second!.referenceUrl).toBeUndefined();
        });
    });

    describe('GraphStore Cypher Queries', () => {
        let mockConnection: GraphConnection;
        let kb: KnowledgeBase;

        beforeEach(() => {
            mockConnection = {
                query: vi.fn().mockResolvedValue({ data: [], statistics: {} }),
            } as unknown as GraphConnection;

            kb = new KnowledgeBase(mockConnection);
        });

        it('should sync parsed lessons idempotently by cleaning old ones and creating node relationships', async () => {
            const lessons = await parseLessonsLearned(fixturePath);
            const result = await kb.syncLessons(lessons);

            expect(result.topics).toBe(3); // Playwright, Gemini, Docker
            expect(result.problems).toBe(2);
            expect(result.solutions).toBe(2);

            // Verify first query was detach delete cleanup
            expect(mockConnection.query).toHaveBeenCalled();
            const firstCall = vi.mocked(mockConnection.query).mock.calls[0][0];
            expect(firstCall).toContain('DETACH DELETE');
            expect(firstCall).toContain('lessons_learned');

            // Verify a Topic node creation
            const calls = vi.mocked(mockConnection.query).mock.calls.map(c => c[0]);
            const topicCreate = calls.find(c => c.includes('CREATE (e:Entity:Topic'));
            expect(topicCreate).toBeDefined();
            expect(topicCreate).toContain('source: \'lessons_learned\'');

            // Verify Problem node creation
            const problemCreate = calls.find(c => c.includes('CREATE (e:Entity:Problem'));
            expect(problemCreate).toBeDefined();

            // Verify relationship creation
            const relatedToCreate = calls.find(c => c.includes('[:RELATED_TO'));
            const solvedByCreate = calls.find(c => c.includes('[:SOLVED_BY'));
            expect(relatedToCreate).toBeDefined();
            expect(solvedByCreate).toBeDefined();
        });

        it('should perform a case-insensitive search and map result nodes into structured output', async () => {
            const mockRow = {
                p: {
                    properties: {
                        id: '1-playwright-submenu',
                        type: 'Problem',
                        name: '1. Playwright Submenu Mechanics',
                        properties: JSON.stringify({ problem: 'Problem context', source: 'lessons_learned' })
                    }
                },
                s: {
                    properties: {
                        id: 'sol-1-playwright-submenu',
                        type: 'Solution',
                        name: 'Solution',
                        properties: JSON.stringify({ solution: 'Solution fix', source: 'lessons_learned' })
                    }
                },
                topics: [
                    {
                        properties: {
                            id: 'topic-playwright',
                            type: 'Topic',
                            name: 'Playwright',
                            properties: JSON.stringify({ source: 'lessons_learned' })
                        }
                    }
                ]
            };

            vi.mocked(mockConnection.query).mockResolvedValue({
                data: [mockRow],
                statistics: {}
            });

            const results = await kb.searchKnowledge('playwright');

            expect(mockConnection.query).toHaveBeenCalled();
            const cypher = vi.mocked(mockConnection.query).mock.calls[0][0];
            expect(cypher).toContain('CONTAINS');
            expect(cypher).toContain('toLower(');

            expect(results).toHaveLength(1);
            expect(results[0].problem.name).toBe('1. Playwright Submenu Mechanics');
            expect(results[0].solution.properties.solution).toBe('Solution fix');
            expect(results[0].topics[0].name).toBe('Playwright');
        });
    });
});
