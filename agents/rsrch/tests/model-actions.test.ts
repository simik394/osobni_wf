import { describe, it, expect, vi } from 'vitest';
import { checkModelStatusAction } from '../src/actions/gemini/session';
import { setModelAction } from '../src/actions/gemini/model';
import { loadSelectors } from '../src/selectors';
import { UniversalContext, GeminiActionDeps } from '../src/actions/types';

describe('Gemini 3 Model Selection & Status Actions', () => {
    const createMockCtx = async () => {
        const log = vi.fn();
        const selectors = await loadSelectors();
        
        const triggerMock = {
            isVisible: vi.fn().mockResolvedValue(true),
            click: vi.fn().mockResolvedValue(undefined),
            waitFor: vi.fn().mockResolvedValue(undefined),
        };

        const menuMock = {
            waitFor: vi.fn().mockResolvedValue(undefined),
        };

        const mockItems = [
            // Item 0: 3.1 Flash-Lite (Active)
            {
                innerText: vi.fn().mockResolvedValue('3.1 Flash-Lite\nFast and lightweight model'),
                getAttribute: vi.fn().mockImplementation(async (attr) => null),
                evaluate: vi.fn().mockResolvedValue(false),
                click: vi.fn().mockResolvedValue(undefined),
                isVisible: vi.fn().mockResolvedValue(true),
            },
            // Item 1: 2.5 Flash (Rate limited / disabled)
            {
                innerText: vi.fn().mockResolvedValue('2.5 Flash\nReset: 19. 5. 9:29\nRate limit reached'),
                getAttribute: vi.fn().mockImplementation(async (attr) => attr === 'aria-disabled' ? 'true' : null),
                evaluate: vi.fn().mockResolvedValue(true),
                click: vi.fn().mockResolvedValue(undefined),
                isVisible: vi.fn().mockResolvedValue(true),
            },
            // Item 2: 3.1 Pro (Rate limited / disabled via Czech text)
            {
                innerText: vi.fn().mockResolvedValue('3.1 Pro\nLimity se obnoví za 1:45\nDočasně vyčerpán'),
                getAttribute: vi.fn().mockImplementation(async (attr) => null),
                evaluate: vi.fn().mockResolvedValue(true), // rate limited
                click: vi.fn().mockResolvedValue(undefined),
                isVisible: vi.fn().mockResolvedValue(true),
            },
            // Item 3: Úroveň myšlení option trigger (should be skipped)
            {
                innerText: vi.fn().mockResolvedValue('Úroveň myšlení\nStandard'),
                getAttribute: vi.fn().mockResolvedValue(null),
                evaluate: vi.fn().mockResolvedValue(false),
                click: vi.fn().mockResolvedValue(undefined),
                isVisible: vi.fn().mockResolvedValue(true),
            }
        ];

        // Specific sub-elements for level options
        const levelOptMock = {
            isVisible: vi.fn().mockResolvedValue(true),
            click: vi.fn().mockResolvedValue(undefined),
            waitFor: vi.fn().mockResolvedValue(undefined),
        };

        const locatorFn = vi.fn().mockImplementation((sel: string) => {
            let matches = [triggerMock]; // default fallback
            
            if (sel === selectors.gemini.model.trigger) {
                matches = [triggerMock];
            } else if (sel === selectors.gemini.model.menu) {
                matches = [menuMock];
            } else if (sel === selectors.gemini.model.lite) {
                matches = [mockItems[0]];
            } else if (sel === selectors.gemini.model.flash) {
                matches = [mockItems[1]];
            } else if (sel === selectors.gemini.model.pro) {
                matches = [mockItems[2]];
            } else if (sel === selectors.gemini.model.thinkingLevel) {
                matches = [levelOptMock];
            } else if (sel === selectors.gemini.model.thinkingStandard || sel === selectors.gemini.model.thinkingExtended) {
                matches = [levelOptMock];
            } else if (sel.includes('menuitem') || sel.includes('option')) {
                matches = mockItems;
            } else if (sel.includes('trigger') || sel.includes('Otevřít') || sel.includes('Změnit')) {
                matches = [triggerMock];
            }

            const locatorObj = {
                first: () => {
                    const firstMatch = matches[0] || triggerMock;
                    return firstMatch;
                },
                count: async () => matches.length,
                nth: (i: number) => {
                    return matches[i] || triggerMock;
                },
                waitFor: async () => undefined,
                isVisible: async () => matches[0] ? await matches[0].isVisible() : true,
                click: async () => matches[0] ? await matches[0].click() : undefined,
            };

            return locatorObj;
        });

        const page = {
            locator: locatorFn,
            waitForTimeout: vi.fn().mockResolvedValue(undefined),
            keyboard: {
                press: vi.fn().mockResolvedValue(undefined),
            },
        } as any;

        return { ctx: { page, log } as any as UniversalContext, triggerMock, levelOptMock, mockItems };
    };

    describe('checkModelStatusAction', () => {
        it('should correctly parse active and rate-limited/disabled models', async () => {
            const selectors = await loadSelectors();
            const { ctx } = await createMockCtx();
            const deps: GeminiActionDeps = { selectors } as any;

            const results = await checkModelStatusAction(ctx, deps);
            console.log('checkModelStatusAction logs:', ctx.log.mock.calls);

            expect(results).toHaveLength(3);
            
            // 3.1 Flash-Lite (lite)
            expect(results[0]).toEqual({
                id: 'lite',
                name: '3.1 Flash-Lite',
                info: 'Fast and lightweight model',
                isLimited: false,
                resetTime: undefined
            });

            // 2.5 Flash (flash)
            expect(results[1]).toEqual({
                id: 'flash',
                name: '2.5 Flash',
                info: 'Reset: 19. 5. 9:29 Rate limit reached',
                isLimited: true,
                resetTime: '19. 5. 9:29'
            });

            // 3.1 Pro (pro)
            expect(results[2]).toEqual({
                id: 'pro',
                name: '3.1 Pro',
                info: 'Limity se obnoví za 1:45 Dočasně vyčerpán',
                isLimited: true,
                resetTime: '1:45'
            });
        });
    });

    describe('setModelAction', () => {
        it('should select base model and adjust thinking level standard/extended', async () => {
            const selectors = await loadSelectors();
            const { ctx, triggerMock, levelOptMock, mockItems } = await createMockCtx();
            const deps: GeminiActionDeps = { selectors } as any;

            const success = await setModelAction(ctx, deps, '3.1 Pro Extended');
            console.log('setModelAction logs:', ctx.log.mock.calls);

            expect(success).toBe(true);
            expect(triggerMock.click).toHaveBeenCalledTimes(2); // One for base model, one for thinking level
            expect(mockItems[2].click).toHaveBeenCalledTimes(1); // Clicked base model "3.1 Pro" (mockItems[2])
            expect(levelOptMock.click).toHaveBeenCalledTimes(2); // Clicked "Úroveň myšlení" (trigger levelOptMock) and "Extended" (trigger levelOptMock)
        });
    });
});
