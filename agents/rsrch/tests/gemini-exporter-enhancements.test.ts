import { test, expect, vi } from 'vitest';
import { parseSessionId } from '../src/clients/gemini';
import { exportFullSessionAction } from '../src/actions/gemini/history';

test('parseSessionId correctly extracts session IDs from various URL formats', () => {
    // 1. Standard App URLs
    expect(parseSessionId('https://gemini.google.com/app/52e272bc92f0d03a')).toBe('52e272bc92f0d03a');
    expect(parseSessionId('https://gemini.google.com/app/52e272bc92f0d03a?hl=cs')).toBe('52e272bc92f0d03a');

    // 2. Shared Public URLs (gem format)
    expect(parseSessionId('https://gemini.google.com/gem/f4c0e97957df/52e272bc92f0d03a')).toBe('f4c0e97957df_52e272bc92f0d03a');
    expect(parseSessionId('https://gemini.google.com/gem/f4c0e97957df/52e272bc92f0d03a?utm_source=share')).toBe('f4c0e97957df_52e272bc92f0d03a');

    // 3. Shared Public URLs (share format)
    expect(parseSessionId('https://gemini.google.com/share/f4c0e97957df/52e272bc92f0d03a')).toBe('f4c0e97957df_52e272bc92f0d03a');

    // 4. Invalid URLs
    expect(parseSessionId('https://gemini.google.com/')).toBeNull();
    expect(parseSessionId('')).toBeNull();
});

test('exportFullSessionAction resolves user file attachments and inlines model canvas', async () => {
    // Mock turns data
    const turns = [
        {
            evaluate: vi.fn().mockImplementation((fn, arg) => {
                const el = {
                    tagName: 'USER-QUERY',
                    classList: { contains: () => false },
                    className: '',
                    querySelector: () => null
                };
                return Promise.resolve(typeof fn === 'function' ? fn(el, arg) : 'USER-QUERY');
            }),
            innerText: vi.fn().mockResolvedValue('My prompt text here'),
            locator: vi.fn().mockImplementation((sel) => {
                if (sel.includes('button.new-file-preview-file') || sel.includes('preview')) {
                    // Mock 1 file preview chip
                    return {
                        count: vi.fn().mockResolvedValue(1),
                        nth: vi.fn().mockReturnValue({
                            getAttribute: vi.fn().mockResolvedValue('Kognitivni Architektura.gdoc'),
                            evaluate: vi.fn().mockImplementation((evalFn) => {
                                const mockEl = {
                                    querySelectorAll: () => [
                                        { textContent: 'Kognitivni Architektura.gdoc' },
                                        { textContent: 'Dokumenty Google' }
                                    ],
                                    textContent: 'Kognitivni Architektura.gdoc'
                                };
                                return Promise.resolve(evalFn(mockEl));
                            }),
                            click: vi.fn().mockResolvedValue(undefined)
                        })
                    };
                }
                return { count: vi.fn().mockResolvedValue(0) };
            })
        },
        {
            evaluate: vi.fn().mockImplementation((fn, arg) => {
                const el = {
                    tagName: 'MODEL-RESPONSE',
                    classList: { contains: (c: string) => c === 'model-response' },
                    className: 'model-response',
                    querySelector: (sel: string) => sel === 'model-response' ? {} : null
                };
                return Promise.resolve(typeof fn === 'function' ? fn(el, arg) : 'MODEL-RESPONSE');
            }),
            locator: vi.fn().mockImplementation((sel) => {
                if (sel === 'immersive-entry-chip' || sel.includes('Canvas')) {
                    return {
                        first: vi.fn().mockReturnValue({
                            isVisible: vi.fn().mockResolvedValue(true),
                            evaluate: vi.fn().mockImplementation((evalFn) => {
                                return Promise.resolve('System Design Doc');
                            }),
                            click: vi.fn().mockResolvedValue(undefined)
                        })
                    };
                }
                return { first: vi.fn().mockReturnValue({ isVisible: vi.fn().mockResolvedValue(false) }) };
            })
        }
    ];

    // Mock page context and elements
    const mockPage = {
        title: vi.fn().mockResolvedValue('Gemini - Test Thread'),
        locator: vi.fn().mockImplementation((selector) => {
            if (selector.includes('user-query') || selector.includes('model-response')) {
                return {
                    first: () => turns[0],
                    count: async () => turns.length,
                    nth: (index: number) => turns[index]
                };
            }
            // Return standard mock locator for other selectors
            return {
                first: () => ({
                    evaluate: vi.fn().mockResolvedValue(''),
                    isVisible: vi.fn().mockResolvedValue(false),
                    click: vi.fn().mockResolvedValue(undefined)
                }),
                count: async () => 0,
                nth: () => null,
                isVisible: async () => false
            };
        }),
        context: vi.fn().mockReturnValue({
            waitForEvent: vi.fn().mockResolvedValue({
                url: vi.fn().mockReturnValue('https://docs.google.com/document/d/mock-id'),
                close: vi.fn()
            })
        }),
        waitForEvent: vi.fn().mockResolvedValue({
            url: vi.fn().mockReturnValue('https://docs.google.com/document/d/mock-id')
        }),
        waitForTimeout: vi.fn().mockResolvedValue(undefined),
        keyboard: { press: vi.fn().mockResolvedValue(undefined) }
    };

    const mockCtx = {
        page: mockPage as any,
        log: vi.fn()
    };

    const mockDeps = {
        selectors: {
            gemini: {
                canvas: {
                    sidePanel: '.immersive-container'
                },
                chat: {
                    response: '.model-response'
                }
            }
        } as any,
        extractResponse: vi.fn().mockResolvedValue({
            markdown: 'Assistant response text with Canvas.',
            thoughts: 'Let me create a document.'
        }),
        readCanvas: vi.fn().mockResolvedValue({
            title: 'System Design Doc',
            markdown: '# System Design Doc\n\nThis is a mock Canvas document content.'
        }),
        closeCanvas: vi.fn().mockResolvedValue(undefined)
    };

    const result = await exportFullSessionAction(mockCtx, mockDeps);

    expect(result.title).toBe('Test Thread');
    expect(result.markdown).toContain('### User');
    expect(result.markdown).toContain('My prompt text here');
    // Verify file attachments resolved & parsed correctly
    expect(result.markdown).toContain('- [📄 Kognitivni Architektura.gdoc (Dokumenty Google)](https://docs.google.com/document/d/mock-id)');
    
    // Verify Canvas was read and inlined correctly
    expect(result.markdown).toContain('### Gemini');
    expect(result.markdown).toContain('#### 📝 Canvas: System Design Doc');
    expect(result.markdown).toContain('This is a mock Canvas document content.');
});
