import { UniversalContext, NotebookLMActionDeps } from '../types';
import { maximizeStudioAction } from './studio';

/**
 * Universal helper to trigger generation of any guide/artifact in the maximized Studio panel.
 */
export async function generateStudioGuideByType(
    ctx: UniversalContext,
    deps: NotebookLMActionDeps,
    labelRegex: RegExp,
    typeName: string,
    options: { sources?: string[] } = {}
): Promise<boolean> {
    const { page, log } = ctx;
    const { sources } = options;

    log(`Generating ${typeName} guide/artifact...`);

    try {
        await maximizeStudioAction(ctx, deps);
        
        if (sources && sources.length > 0) {
            await deps.selectSources!(sources);
        }

        // Language-agnostic click using localized / regular-expression matching
        const button = page.locator('button, div, [role="button"]')
            .filter({ hasText: labelRegex })
            .first();

        if (await button.count() === 0 || !(await button.isVisible())) {
            log(`${typeName} generation button not found in maximized studio panel.`, 'error');
            return false;
        }

        await button.click();
        log(`${typeName} generation successfully triggered.`);
        
        // Wait for generation to register/start
        await page.waitForTimeout(2500);
        return true;
    } catch (e: any) {
        log(`Failed to generate ${typeName}: ${e.message}`, 'error');
        return false;
    }
}

/**
 * Triggers the generation of a Slide Deck (Presentation) in NotebookLM.
 */
export async function generatePresentationAction(
    ctx: UniversalContext,
    deps: NotebookLMActionDeps,
    options: { sources?: string[] } = {}
): Promise<boolean> {
    return generateStudioGuideByType(ctx, deps, /Prezentace|Slide deck|Presentation/i, 'Presentation', options);
}

/**
 * Triggers the generation of an Infographic in NotebookLM.
 */
export async function generateInfographicAction(
    ctx: UniversalContext,
    deps: NotebookLMActionDeps,
    options: { sources?: string[] } = {}
): Promise<boolean> {
    return generateStudioGuideByType(ctx, deps, /Infografika|Infographic/i, 'Infographic', options);
}

/**
 * Triggers the generation of a Study Guide in NotebookLM.
 */
export async function generateStudyGuideAction(
    ctx: UniversalContext,
    deps: NotebookLMActionDeps,
    options: { sources?: string[] } = {}
): Promise<boolean> {
    return generateStudioGuideByType(ctx, deps, /Studijní příručka|Study guide/i, 'Study Guide', options);
}

/**
 * Triggers the generation of a FAQ in NotebookLM.
 */
export async function generateFaqAction(
    ctx: UniversalContext,
    deps: NotebookLMActionDeps,
    options: { sources?: string[] } = {}
): Promise<boolean> {
    return generateStudioGuideByType(ctx, deps, /Často kladené otázky|FAQ/i, 'FAQ', options);
}

/**
 * Triggers the generation of a Briefing Doc in NotebookLM.
 */
export async function generateBriefingDocAction(
    ctx: UniversalContext,
    deps: NotebookLMActionDeps,
    options: { sources?: string[] } = {}
): Promise<boolean> {
    return generateStudioGuideByType(ctx, deps, /Dokument s pokyny|Briefing doc/i, 'Briefing Doc', options);
}

/**
 * Triggers the generation of a Timeline in NotebookLM.
 */
export async function generateTimelineAction(
    ctx: UniversalContext,
    deps: NotebookLMActionDeps,
    options: { sources?: string[] } = {}
): Promise<boolean> {
    return generateStudioGuideByType(ctx, deps, /Časová osa|Timeline/i, 'Timeline', options);
}

/**
 * Triggers the generation of a Table of Contents in NotebookLM.
 */
export async function generateTocAction(
    ctx: UniversalContext,
    deps: NotebookLMActionDeps,
    options: { sources?: string[] } = {}
): Promise<boolean> {
    return generateStudioGuideByType(ctx, deps, /Obsah|Table of contents/i, 'Table of Contents', options);
}

