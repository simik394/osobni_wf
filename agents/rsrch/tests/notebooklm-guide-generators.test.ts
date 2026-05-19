import { test, expect, vi } from 'vitest';
import {
    generatePresentationAction,
    generateInfographicAction,
    generateStudyGuideAction,
    generateFaqAction,
    generateBriefingDocAction,
    generateTimelineAction,
    generateTocAction
} from '../src/actions/notebooklm/generate-visuals';

// Mock the studio module to prevent actual maximizeStudioAction from running
vi.mock('../src/actions/notebooklm/studio', () => ({
    maximizeStudioAction: vi.fn().mockResolvedValue(true)
}));

test('All guide actions successfully locate and click buttons in the studio panel', async () => {
    const mockClick = vi.fn().mockResolvedValue(undefined);
    const mockFilter = vi.fn().mockReturnValue({
        first: () => ({
            count: vi.fn().mockResolvedValue(1),
            isVisible: vi.fn().mockResolvedValue(true),
            click: mockClick
        })
    });

    const mockPage = {
        locator: vi.fn().mockReturnValue({
            filter: mockFilter
        }),
        waitForTimeout: vi.fn().mockResolvedValue(undefined)
    };

    const mockCtx = {
        page: mockPage as any,
        log: vi.fn(),
        config: {} as any
    };

    const mockSelectSources = vi.fn().mockResolvedValue(undefined);
    const mockDeps = {
        selectors: {} as any,
        selectSources: mockSelectSources
    };

    // 1. Study Guide
    mockClick.mockClear();
    mockFilter.mockClear();
    let res = await generateStudyGuideAction(mockCtx, mockDeps, { sources: ['Source A'] });
    expect(res).toBe(true);
    expect(mockSelectSources).toHaveBeenCalledWith(['Source A']);
    expect(mockFilter).toHaveBeenCalledWith({ hasText: /Studijní příručka|Study guide/i });
    expect(mockClick).toHaveBeenCalled();

    // 2. FAQ
    mockClick.mockClear();
    mockFilter.mockClear();
    res = await generateFaqAction(mockCtx, mockDeps);
    expect(res).toBe(true);
    expect(mockFilter).toHaveBeenCalledWith({ hasText: /Často kladené otázky|FAQ/i });
    expect(mockClick).toHaveBeenCalled();

    // 3. Briefing Doc
    mockClick.mockClear();
    mockFilter.mockClear();
    res = await generateBriefingDocAction(mockCtx, mockDeps);
    expect(res).toBe(true);
    expect(mockFilter).toHaveBeenCalledWith({ hasText: /Dokument s pokyny|Briefing doc/i });
    expect(mockClick).toHaveBeenCalled();

    // 4. Timeline
    mockClick.mockClear();
    mockFilter.mockClear();
    res = await generateTimelineAction(mockCtx, mockDeps);
    expect(res).toBe(true);
    expect(mockFilter).toHaveBeenCalledWith({ hasText: /Časová osa|Timeline/i });
    expect(mockClick).toHaveBeenCalled();

    // 5. Table of Contents
    mockClick.mockClear();
    mockFilter.mockClear();
    res = await generateTocAction(mockCtx, mockDeps);
    expect(res).toBe(true);
    expect(mockFilter).toHaveBeenCalledWith({ hasText: /Obsah|Table of contents/i });
    expect(mockClick).toHaveBeenCalled();

    // 6. Presentation
    mockClick.mockClear();
    mockFilter.mockClear();
    res = await generatePresentationAction(mockCtx, mockDeps);
    expect(res).toBe(true);
    expect(mockFilter).toHaveBeenCalledWith({ hasText: /Prezentace|Slide deck|Presentation/i });
    expect(mockClick).toHaveBeenCalled();

    // 7. Infographic
    mockClick.mockClear();
    mockFilter.mockClear();
    res = await generateInfographicAction(mockCtx, mockDeps);
    expect(res).toBe(true);
    expect(mockFilter).toHaveBeenCalledWith({ hasText: /Infografika|Infographic/i });
    expect(mockClick).toHaveBeenCalled();
});
