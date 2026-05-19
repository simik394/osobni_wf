import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import { loadSelectors } from '../src/selectors';
import { UniversalContext, AIModeActionDeps } from '../src/actions/types';
import { listAIModeHistoryAction, listAIModeMyActivityAction } from '../src/actions/aimode/history';
import { setAIModeModelAction, uploadAIModeFileAction, saveActiveAIModeChatAction, mergeTurns, Turn } from '../src/actions/aimode/chat';

describe('AI Mode Enhancements Action Suite', () => {
    let mockPage: any;
    let mockLog: any;
    let selectors: any;
    let deps: AIModeActionDeps;

    beforeEach(async () => {
        selectors = await loadSelectors();
        mockLog = vi.fn();

        mockPage = {
            url: vi.fn().mockReturnValue('https://www.google.com/search?udm=50&mstk=test_mstk_token'),
            goto: vi.fn().mockResolvedValue(undefined),
            waitForTimeout: vi.fn().mockResolvedValue(undefined),
            evaluate: vi.fn().mockResolvedValue([]),
            screenshot: vi.fn().mockResolvedValue(Buffer.from([])),
            locator: vi.fn().mockImplementation((sel: string) => {
                const mockLocator = {
                    first: () => mockLocator,
                    last: () => mockLocator,
                    nth: (n: number) => mockLocator,
                    count: vi.fn().mockResolvedValue(1),
                    isVisible: vi.fn().mockResolvedValue(true),
                    click: vi.fn().mockResolvedValue(undefined),
                    innerText: vi.fn().mockResolvedValue('Mock Text\nDescription'),
                    getAttribute: vi.fn().mockImplementation(async (attr) => {
                        if (attr === 'href') return 'https://myactivity.google.com/myactivity?product=83&mstk=mock_mstk_id';
                        return null;
                    }),
                    scrollIntoViewIfNeeded: vi.fn().mockResolvedValue(undefined),
                };
                return mockLocator;
            }),
        } as any;

        deps = {
            selectors,
            humanDelay: vi.fn().mockResolvedValue(undefined),
            dumpState: vi.fn().mockResolvedValue({ htmlPath: 'mock.html', pngPath: 'mock.png' }),
        };
    });

    describe('Pagination of AI Mode History (Sidebar)', () => {
        it('should load history and apply offset and limit/size correctly', async () => {
            const mockItems = [
                { text: 'Prompt A\nDetails' },
                { text: 'Prompt B\nDetails' },
                { text: 'Prompt C\nDetails' },
                { text: 'Prompt D\nDetails' },
            ];

            mockPage.locator = vi.fn().mockImplementation((sel: string) => {
                const countVal = sel === selectors.aiMode.sidebar.historyItem ? mockItems.length : 1;
                const mockLocator: any = {
                    first: () => mockLocator,
                    last: () => mockLocator,
                    nth: (n: number) => {
                        const item = mockItems[n] || { text: '' };
                        const singleLocator = {
                            innerText: vi.fn().mockResolvedValue(item.text),
                            isVisible: vi.fn().mockResolvedValue(true),
                            click: vi.fn().mockResolvedValue(undefined),
                        };
                        return singleLocator;
                    },
                    count: vi.fn().mockResolvedValue(countVal),
                    isVisible: vi.fn().mockResolvedValue(true),
                    click: vi.fn().mockResolvedValue(undefined),
                };
                return mockLocator;
            });

            const ctx: UniversalContext = { page: mockPage, log: mockLog, config: {} as any };
            const results = await listAIModeHistoryAction(ctx, deps, { offset: 1, limit: 2 });

            expect(results).toHaveLength(2);
            expect(results[0].query).toBe('Prompt B');
            expect(results[1].query).toBe('Prompt C');
        });
    });

    describe('Pagination of My Activity', () => {
        it('should load and paginate myactivity items correctly', async () => {
            const mockItems = [
                { text: 'Vyhledali jste: query 1', href: '/url1?mstk=id1' },
                { text: 'You searched for: query 2', href: '/url2?mstk=id2' },
                { text: 'query 3', href: '/url3?mstk=id3' },
            ];

            mockPage.locator = vi.fn().mockImplementation((sel: string) => {
                const countVal = (sel === selectors.aiMode.myActivity.activityItem || sel === selectors.aiMode.myActivity.activityItemFallback) ? mockItems.length : 1;
                const mockLocator: any = {
                    first: () => mockLocator,
                    last: () => mockLocator,
                    nth: (n: number) => {
                        const item = mockItems[n] || { text: '', href: '' };
                        const singleLocator = {
                            innerText: vi.fn().mockResolvedValue(item.text),
                            getAttribute: vi.fn().mockImplementation(async (attr) => attr === 'href' ? item.href : null),
                            isVisible: vi.fn().mockResolvedValue(true),
                        };
                        return singleLocator;
                    },
                    count: vi.fn().mockResolvedValue(countVal),
                    isVisible: vi.fn().mockResolvedValue(true),
                    scrollIntoViewIfNeeded: vi.fn().mockResolvedValue(undefined),
                };
                return mockLocator;
            });

            const ctx: UniversalContext = { page: mockPage, log: mockLog, config: {} as any };
            const results = await listAIModeMyActivityAction(ctx, deps, { offset: 1, limit: 10 });

            expect(results).toHaveLength(2);
            expect(results[0].query).toBe('query 2');
            expect(results[0].id).toBe('id2');
            expect(results[1].query).toBe('query 3');
            expect(results[1].id).toBe('id3');
        });
    });

    describe('Model Switching Action', () => {
        it('should successfully switch model to pro', async () => {
            const ctx: UniversalContext = { page: mockPage, log: mockLog, config: {} as any };
            const success = await setAIModeModelAction(ctx, deps, 'pro');
            expect(success).toBe(true);
            expect(mockPage.goto).not.toHaveBeenCalled(); // URL already matches udm=50 in mockPage
        });

        it('should successfully switch model to auto', async () => {
            const ctx: UniversalContext = { page: mockPage, log: mockLog, config: {} as any };
            const success = await setAIModeModelAction(ctx, deps, 'auto');
            expect(success).toBe(true);
        });
    });

    describe('Conditional File Uploading Action', () => {
        it('should allow image uploading in pro mode', async () => {
            const ctx: UniversalContext = { page: mockPage, log: mockLog, config: {} as any };
            // Mock file chooser
            mockPage.waitForEvent = vi.fn().mockResolvedValue({
                setFiles: vi.fn().mockResolvedValue(undefined),
            });

            const success = await uploadAIModeFileAction(ctx, deps, 'tests/fixtures/sample.png', { model: 'pro' });
            expect(success).toBe(true);
        });

        it('should throw an error for non-image uploads in pro mode', async () => {
            const ctx: UniversalContext = { page: mockPage, log: mockLog, config: {} as any };
            await expect(
                uploadAIModeFileAction(ctx, deps, 'tests/fixtures/sample.pdf', { model: 'pro' })
            ).rejects.toThrow('Model \'pro\' only supports uploading image files');
        });

        it('should allow regular file uploads in auto mode', async () => {
            const ctx: UniversalContext = { page: mockPage, log: mockLog, config: {} as any };
            mockPage.waitForEvent = vi.fn().mockResolvedValue({
                setFiles: vi.fn().mockResolvedValue(undefined),
            });

            const success = await uploadAIModeFileAction(ctx, deps, 'tests/fixtures/sample.pdf', { model: 'auto' });
            expect(success).toBe(true);
        });
    });

    describe('Merge Turns and Scraping', () => {
        it('should properly align and merge turns without duplicates', () => {
            const stored: Turn[] = [
                { role: 'user', content: 'What is 2+2?' },
                { role: 'assistant', content: 'It is 4.' },
                { role: 'user', content: 'What is 3+3?' },
            ];

            const active: Turn[] = [
                { role: 'user', content: 'What is 3+3?' },
                { role: 'assistant', content: 'It is 6.' },
                { role: 'user', content: 'What is 5+5?' },
            ];

            const merged = mergeTurns(stored, active);
            expect(merged).toHaveLength(5);
            expect(merged[0].content).toBe('What is 2+2?');
            expect(merged[1].content).toBe('It is 4.');
            expect(merged[2].content).toBe('What is 3+3?');
            expect(merged[3].content).toBe('It is 6.');
            expect(merged[4].content).toBe('What is 5+5?');
        });

        it('should successfully scrape and save active chat session', async () => {
            const activeTurns = [
                { role: 'user', content: 'Initial question' },
                { role: 'assistant', content: 'Initial answer' },
            ];
            mockPage.evaluate = vi.fn().mockResolvedValue(activeTurns);

            const tempFile = path.join(__dirname, 'fixtures', 'temp_aimode_chat.json');
            if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);

            const ctx: UniversalContext = { page: mockPage, log: mockLog, config: {} as any };
            const result = await saveActiveAIModeChatAction(ctx, deps, { outputFile: tempFile });

            expect(result.filePath).toBe(tempFile);
            expect(result.turnCount).toBe(2);
            expect(result.merged).toBe(false);
            expect(fs.existsSync(tempFile)).toBe(true);

            // Clean up
            if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
        });
    });
});
