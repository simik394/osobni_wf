import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadSelectors } from '../src/selectors';
import { UniversalContext, NotebookLMActionDeps } from '../src/actions/types';
import {
    listKeepNotesAction,
    createKeepNoteAction,
    deleteKeepNoteAction,
    archiveKeepNoteAction,
    searchKeepNotesAction,
    getKeepNoteAction,
    updateKeepNoteAction,
    manageKeepLabelsAction,
    grabKeepNoteImageTextAction,
    addKeepCollaboratorAction,
    setKeepReminderAction
} from '../src/actions/keep';

describe('Google Keep Action Suite', () => {
    let mockPage: any;
    let mockLog: any;
    let selectors: any;
    let deps: NotebookLMActionDeps;

    beforeEach(async () => {
        selectors = await loadSelectors();
        mockLog = vi.fn();

        mockPage = {
            goto: vi.fn().mockResolvedValue(undefined),
            waitForSelector: vi.fn().mockResolvedValue(undefined),
            waitForTimeout: vi.fn().mockResolvedValue(undefined),
            evaluate: vi.fn().mockResolvedValue([]),
            keyboard: {
                press: vi.fn().mockResolvedValue(undefined)
            },
            locator: vi.fn().mockImplementation((sel: string) => {
                const mockLocator: any = {
                    first: () => mockLocator,
                    last: () => mockLocator,
                    nth: (n: number) => mockLocator,
                    filter: () => mockLocator,
                    locator: () => mockLocator,
                    count: vi.fn().mockResolvedValue(1),
                    isVisible: vi.fn().mockResolvedValue(true),
                    click: vi.fn().mockResolvedValue(undefined),
                    fill: vi.fn().mockResolvedValue(undefined),
                    press: vi.fn().mockResolvedValue(undefined),
                    pressSequentially: vi.fn().mockResolvedValue(undefined),
                    hover: vi.fn().mockResolvedValue(undefined),
                    textContent: vi.fn().mockResolvedValue('Mock Text'),
                    getAttribute: vi.fn().mockResolvedValue('false'),
                    evaluateAll: vi.fn().mockResolvedValue(['Mock Tag'])
                };
                return mockLocator;
            }),
        } as any;

        deps = {
            selectors,
        } as NotebookLMActionDeps;
    });

    describe('listKeepNotesAction', () => {
        it('should successfully retrieve and filter notes by query', async () => {
            const mockNotes = [
                { title: 'Shopping List', content: 'milk, bread, butter', tags: [] },
                { title: 'Project Ideas', content: 'build a stateless researcher agent', tags: [] },
                { title: 'Passwords', content: 'never store passwords in keep', tags: [] },
            ];

            mockPage.evaluate = vi.fn().mockImplementation(async (fn: any, args: any) => {
                if (fn.toString().includes('scrollHeight')) {
                    return 1000;
                }
                return mockNotes;
            });

            const ctx: UniversalContext = { page: mockPage, log: mockLog, config: {} as any };
            const results = await listKeepNotesAction(ctx, deps, { limit: 2, query: 'stateless' });

            expect(results).toHaveLength(1);
            expect(results[0].title).toBe('Project Ideas');
        });

        it('should return all notes within the limit if no query is provided', async () => {
            const mockNotes = [
                { title: 'shopping', content: 'eggs', tags: [] },
                { title: 'tasks', content: 'clean room', tags: [] },
            ];

            mockPage.evaluate = vi.fn().mockImplementation(async (fn: any) => {
                if (fn.toString().includes('scrollHeight')) return 1000;
                return mockNotes;
            });

            const ctx: UniversalContext = { page: mockPage, log: mockLog, config: {} as any };
            const results = await listKeepNotesAction(ctx, deps, { limit: 5 });

            expect(results).toHaveLength(2);
            expect(results[0].title).toBe('shopping');
            expect(results[1].title).toBe('tasks');
        });
    });

    describe('createKeepNoteAction', () => {
        it('should fill title and content and click done button', async () => {
            const ctx: UniversalContext = { page: mockPage, log: mockLog, config: {} as any };
            const success = await createKeepNoteAction(ctx, deps, 'Test Title', 'Test Content');

            expect(success).toBe(true);
            expect(mockPage.goto).toHaveBeenCalledWith('https://keep.google.com');
        });
    });

    describe('getKeepNoteAction', () => {
        it('should fetch complete note details via title', async () => {
            const ctx: UniversalContext = { page: mockPage, log: mockLog, config: {} as any };
            const result = await getKeepNoteAction(ctx, deps, { title: 'Shopping List' });

            expect(result).not.toBeNull();
            expect(result?.title).toBe('Mock Text');
            expect(result?.tags).toContain('Mock Tag');
        });

        it('should fetch complete note details via index', async () => {
            const ctx: UniversalContext = { page: mockPage, log: mockLog, config: {} as any };
            const result = await getKeepNoteAction(ctx, deps, { index: 3 });

            expect(result).not.toBeNull();
            expect(result?.title).toBe('Mock Text');
        });
    });

    describe('updateKeepNoteAction', () => {
        it('should append content by default', async () => {
            const ctx: UniversalContext = { page: mockPage, log: mockLog, config: {} as any };
            const success = await updateKeepNoteAction(ctx, deps, { index: 1 }, { newContent: 'Appended Content' });

            expect(success).toBe(true);
        });

        it('should replace content if replace option is true', async () => {
            const ctx: UniversalContext = { page: mockPage, log: mockLog, config: {} as any };
            const success = await updateKeepNoteAction(ctx, deps, { title: 'Shopping List' }, { newContent: 'Replaced Content', replace: true });

            expect(success).toBe(true);
        });
    });

    describe('manageKeepLabelsAction', () => {
        it('should add a label successfully', async () => {
            const ctx: UniversalContext = { page: mockPage, log: mockLog, config: {} as any };
            const success = await manageKeepLabelsAction(ctx, deps, { index: 1 }, 'New Tag', 'add');

            expect(success).toBe(true);
        });

        it('should remove a label successfully', async () => {
            const ctx: UniversalContext = { page: mockPage, log: mockLog, config: {} as any };
            const success = await manageKeepLabelsAction(ctx, deps, { title: 'Shopping List' }, 'Old Tag', 'remove');

            expect(success).toBe(true);
        });
    });

    describe('grabKeepNoteImageTextAction', () => {
        it('should trigger OCR action and complete', async () => {
            const ctx: UniversalContext = { page: mockPage, log: mockLog, config: {} as any };
            const success = await grabKeepNoteImageTextAction(ctx, deps, { index: 2 });

            expect(success).toBe(true);
        });
    });

    describe('addKeepCollaboratorAction', () => {
        it('should add a collaborator email', async () => {
            const ctx: UniversalContext = { page: mockPage, log: mockLog, config: {} as any };
            const success = await addKeepCollaboratorAction(ctx, deps, { index: 1 }, 'collaborator@example.com');

            expect(success).toBe(true);
        });
    });

    describe('setKeepReminderAction', () => {
        it('should set tomorrow reminder option', async () => {
            const ctx: UniversalContext = { page: mockPage, log: mockLog, config: {} as any };
            const success = await setKeepReminderAction(ctx, deps, { index: 1 }, 'tomorrow');

            expect(success).toBe(true);
        });
    });

    describe('deleteKeepNoteAction', () => {
        it('should find note by title, hover, open more menu, and click delete option', async () => {
            const ctx: UniversalContext = { page: mockPage, log: mockLog, config: {} as any };
            const success = await deleteKeepNoteAction(ctx, deps, 'Test Note to Delete');

            expect(success).toBe(true);
            expect(mockPage.goto).toHaveBeenCalledWith('https://keep.google.com');
        });
    });

    describe('archiveKeepNoteAction', () => {
        it('should find note by title, hover, and click archive button', async () => {
            const ctx: UniversalContext = { page: mockPage, log: mockLog, config: {} as any };
            const success = await archiveKeepNoteAction(ctx, deps, 'Test Note to Archive');

            expect(success).toBe(true);
            expect(mockPage.goto).toHaveBeenCalledWith('https://keep.google.com');
        });
    });

    describe('searchKeepNotesAction', () => {
        it('should enter query in search bar, press enter, and return matching notes', async () => {
            const mockNotes = [
                { title: 'Found Note', content: 'Matches the query', tags: [] }
            ];
            mockPage.evaluate = vi.fn().mockResolvedValue(mockNotes);

            const ctx: UniversalContext = { page: mockPage, log: mockLog, config: {} as any };
            const results = await searchKeepNotesAction(ctx, deps, 'Found');

            expect(results).toHaveLength(1);
            expect(results[0].title).toBe('Found Note');
            expect(mockPage.goto).toHaveBeenCalledWith('https://keep.google.com');
        });
    });
});
