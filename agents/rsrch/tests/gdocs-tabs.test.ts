import { describe, it, expect, vi, beforeEach } from 'vitest';

import { loadSelectors } from '../src/selectors';
import { UniversalContext, GDocsActionDeps, AIModeActionDeps } from '../src/actions/types';
import { createGDocAction, addGDocTabAction, switchGDocTabAction, writeToGDocAction, listGDocTabsAction, addSubtabGDocAction, duplicateGDocTabAction } from '../src/actions/gdocs';
import { exportAIModeToGDocAction } from '../src/actions/aimode/chat';
import * as fs from 'fs';
import * as path from 'path';

describe('GDocs Tabs & AI Mode Export Suite', () => {
    let mockPage: any;
    let mockLog: any;
    let selectors: any;
    let gdocsDeps: GDocsActionDeps;
    let aimodeDeps: AIModeActionDeps;

    beforeEach(async () => {
        selectors = await loadSelectors();
        mockLog = vi.fn();

        const createMockLocator = () => {
            const mockLocator: any = {
                first: () => mockLocator,
                last: () => mockLocator,
                nth: (n: number) => mockLocator,
                count: vi.fn().mockResolvedValue(1),
                isVisible: vi.fn().mockResolvedValue(true),
                click: vi.fn().mockResolvedValue(undefined),
                innerText: vi.fn().mockResolvedValue('Mock Tab'),
                getAttribute: vi.fn().mockImplementation(async (attr) => {
                    if (attr === 'aria-expanded') return 'false';
                    if (attr === 'aria-selected') return 'true';
                    return null;
                }),
                hover: vi.fn().mockResolvedValue(undefined),
                filter: vi.fn().mockImplementation(() => mockLocator),
                locator: vi.fn().mockImplementation(() => mockLocator),
            };
            return mockLocator;
        };

        const globalMockLocator = createMockLocator();

        mockPage = {
            url: vi.fn().mockReturnValue('https://docs.google.com/document/d/mock_doc_id/edit'),
            goto: vi.fn().mockResolvedValue(undefined),
            waitForTimeout: vi.fn().mockResolvedValue(undefined),
            waitForSelector: vi.fn().mockResolvedValue(undefined),
            fill: vi.fn().mockResolvedValue(undefined),
            click: vi.fn().mockResolvedValue(undefined),
            hover: vi.fn().mockResolvedValue(undefined),
            evaluate: vi.fn().mockResolvedValue([]),
            keyboard: {
                press: vi.fn().mockResolvedValue(undefined),
                type: vi.fn().mockResolvedValue(undefined),
                insertText: vi.fn().mockResolvedValue(undefined),
            },
            locator: vi.fn().mockImplementation(() => globalMockLocator),
        } as any;

        gdocsDeps = {
            selectors,
            humanDelay: vi.fn().mockResolvedValue(undefined),
        };

        aimodeDeps = {
            selectors,
            humanDelay: vi.fn().mockResolvedValue(undefined),
            dumpState: vi.fn().mockResolvedValue({ htmlPath: 'mock.html', pngPath: 'mock.png' }),
        };
    });

    describe('GDocs Document & Tab Management', () => {
        it('should create a new GDoc with title', async () => {
            const ctx: UniversalContext = { page: mockPage, log: mockLog, config: { selectors } as any };
            const url = await createGDocAction(ctx, 'Test Document');
            expect(url).toBe('https://docs.google.com/document/d/mock_doc_id/edit');
            expect(mockPage.goto).toHaveBeenCalledWith('https://docs.new');
            expect(mockPage.fill).toHaveBeenCalledWith(selectors.gdocs.titleInput, 'Test Document');
        });

        it('should switch to a tab by name', async () => {
            const ctx: UniversalContext = { page: mockPage, log: mockLog, config: { selectors } as any };
            const success = await switchGDocTabAction(ctx, gdocsDeps, 'Phase 1');
            expect(success).toBe(true);
            expect(mockPage.locator).toHaveBeenCalledWith(selectors.gdocs.tabs.toggleSidebar);
        });

        it('should add a new tab', async () => {
            const ctx: UniversalContext = { page: mockPage, log: mockLog, config: { selectors } as any };
            const success = await addGDocTabAction(ctx, gdocsDeps, 'New Tab');
            expect(success).toBe(true);
            expect(mockPage.locator).toHaveBeenCalledWith(selectors.gdocs.tabs.addTab);
        });

        it('should list all tabs', async () => {
            const ctx: UniversalContext = { page: mockPage, log: mockLog, config: { selectors } as any };
            const tabs = await listGDocTabsAction(ctx, gdocsDeps);
            expect(tabs).toEqual(['Mock Tab']);
            expect(mockPage.locator).toHaveBeenCalledWith(selectors.gdocs.tabs.tabItem);
        });

        it('should add a subtab', async () => {
            const ctx: UniversalContext = { page: mockPage, log: mockLog, config: { selectors } as any };
            const success = await addSubtabGDocAction(ctx, gdocsDeps, 'Parent Tab', 'Child Tab');
            expect(success).toBe(true);
        });

        it('should duplicate a tab', async () => {
            const ctx: UniversalContext = { page: mockPage, log: mockLog, config: { selectors } as any };
            const success = await duplicateGDocTabAction(ctx, gdocsDeps, 'Target Tab');
            expect(success).toBe(true);
        });

        it('should write content to document', async () => {
            const ctx: UniversalContext = { page: mockPage, log: mockLog, config: { selectors } as any };
            const success = await writeToGDocAction(ctx, 'Hello World');
            expect(success).toBe(true);
            expect(mockPage.keyboard.insertText).toHaveBeenCalledWith('Hello World');
        });
    });

    describe('AI Mode to GDoc Export', () => {
        it('should export active AI Mode session to a new GDoc', async () => {
            const mockTurns = [
                { role: 'user', content: 'Hello' },
                { role: 'assistant', content: 'Hi there!' },
            ];
            mockPage.evaluate = vi.fn().mockResolvedValue(mockTurns);

            const ctx: UniversalContext = { page: mockPage, log: mockLog, config: { selectors } as any };
            const docUrl = await exportAIModeToGDocAction(ctx, aimodeDeps, { title: 'AI Export' });

            expect(docUrl).toBe('https://docs.google.com/document/d/mock_doc_id/edit');
            expect(mockPage.keyboard.insertText).toHaveBeenCalled();
            
            // Clean up any generated temp files from saveActiveAIModeChatAction
            const files = fs.readdirSync(process.cwd()).filter(f => f.startsWith('aimode_session_'));
            for (const f of files) fs.unlinkSync(f);
        });

        it('should export to a specific tab in an existing GDoc', async () => {
            const mockTurns = [{ role: 'user', content: 'Test' }];
            mockPage.evaluate = vi.fn().mockResolvedValue(mockTurns);

            const ctx: UniversalContext = { page: mockPage, log: mockLog, config: { selectors } as any };
            const docUrl = await exportAIModeToGDocAction(ctx, aimodeDeps, { 
                docUrl: 'https://docs.google.com/document/d/existing_id/edit',
                tabName: 'AI Results' 
            });

            expect(docUrl).toBe('https://docs.google.com/document/d/existing_id/edit');
            expect(mockPage.goto).toHaveBeenCalledWith('https://docs.google.com/document/d/existing_id/edit');
            
            // Clean up
            const files = fs.readdirSync(process.cwd()).filter(f => f.startsWith('aimode_session_'));
            for (const f of files) fs.unlinkSync(f);
        });
    });
});
