
import { GeminiClient } from '../src/clients/gemini';
import { Page } from 'playwright';
import { vi, describe, it, expect, beforeEach, Mock } from 'vitest';

// Mock the shared telemetry and defaults
vi.mock('@agents/shared', async (importOriginal) => {
    const actual = await importOriginal() as any;
    return {
        ...actual,
        getRsrchTelemetry: vi.fn().mockReturnValue({
            startTrace: vi.fn(() => ({
                span: {
                    addEvent: vi.fn(),
                },
                end: vi.fn(),
            })),
            startGeneration: vi.fn(() => ({
                generation: {
                    end: vi.fn(),
                },
            })),
            endGeneration: vi.fn(),
            endTrace: vi.fn(),
            addScore: vi.fn(),
            trackError: vi.fn(),
        }),
    };
});

// Mock the entire playwright module
vi.mock('playwright');

// Create a type for the mocked page to help with intellisense
type MockPage = {
    [K in keyof Page]: Mock<Parameters<Page[K]>, ReturnType<Page[K]>>;
} & {
    locator: Mock<any, any>; // Make locator more flexible for chaining
    context: Mock<any, any>;
};


const createMockLocator = (isVisible = true, text = '', html = '') => {
    const locator = {
        count: vi.fn().mockResolvedValue(isVisible ? 1 : 0),
        isVisible: vi.fn().mockImplementation(async (opts) => {
            console.log(`[DEBUG] isVisible called (result=${isVisible}, opts=${JSON.stringify(opts)})`);
            return isVisible;
        }),
        innerText: vi.fn().mockResolvedValue(text),
        innerHTML: vi.fn().mockResolvedValue(html),
        first: vi.fn().mockReturnThis(),
        last: vi.fn().mockReturnThis(),
        nth: vi.fn().mockReturnThis(),
        click: vi.fn().mockResolvedValue(undefined),
        fill: vi.fn().mockResolvedValue(undefined),
        press: vi.fn().mockResolvedValue(undefined),
        waitFor: vi.fn().mockResolvedValue(undefined),
        getAttribute: vi.fn().mockResolvedValue(''),
        evaluate: vi.fn().mockImplementation((fn, arg) => {
            // Provide a minimal DOM-like mock for cloneNode, querySelector, etc.
            const mockEl = {
                tagName: 'DIV',
                className: 'mock-class',
                innerText: text,
                innerHTML: html,
                textContent: text,
                cloneNode: vi.fn().mockReturnThis(),
                querySelectorAll: vi.fn().mockReturnValue([]),
                querySelector: vi.fn().mockImplementation((sel) => {
                    if (!sel) return null;
                    return { innerText: text, innerHTML: html, textContent: text, cloneNode: vi.fn().mockReturnThis() };
                }),
                closest: vi.fn().mockReturnValue(null),
                getAttribute: vi.fn().mockReturnValue(''),
                insertBefore: vi.fn(),
                classList: { contains: vi.fn().mockReturnValue(false) },
                parentElement: null,
            };

            // Also mock global document for createTextNode which is used in evaluate
            const originalDocument = (global as any).document;
            (global as any).document = {
                createTextNode: vi.fn().mockImplementation(t => ({ textContent: t })),
            };
            
            try {
                return Promise.resolve(fn(mockEl, arg));
            } finally {
                (global as any).document = originalDocument;
            }
        }),
        scrollIntoViewIfNeeded: vi.fn().mockResolvedValue(undefined),
        locator: vi.fn().mockImplementation(() => createMockLocator(true, '', '')),
    };
    return locator;
};


describe('GeminiClient', () => {
    let mockPage: MockPage;
    let client: GeminiClient;

    afterEach(() => {
        vi.restoreAllMocks();
    });

    beforeEach(() => {
        mockPage = {
            goto: vi.fn().mockResolvedValue(null),
            waitForTimeout: vi.fn().mockResolvedValue(null),
            waitForSelector: vi.fn().mockResolvedValue(null),
            url: vi.fn().mockReturnValue('https://gemini.google.com/app/12345'),
            locator: vi.fn((selector) => {
                if (selector.includes('Sign in')) {
                    // Default to no sign-in button
                    return createMockLocator(false);
                }
                if (selector.includes('model-response')) {
                    return createMockLocator(true, 'This is a response.');
                }
                if (selector.includes('div[contenteditable="true"]')) {
                    return createMockLocator(true);
                }
                // Default locator
                return createMockLocator(true);
            }),
            keyboard: {
                press: vi.fn().mockResolvedValue(undefined),
                type: vi.fn().mockResolvedValue(undefined),
            },
            context: vi.fn(() => ({
                waitForEvent: vi.fn().mockResolvedValue({
                    url: () => 'https://docs.google.com/document/d/doc-id-123',
                    waitForLoadState: vi.fn().mockResolvedValue(undefined),
                    title: vi.fn().mockResolvedValue('My Google Doc'),
                    close: vi.fn().mockResolvedValue(undefined),
                }),
            })),
            evaluate: vi.fn().mockResolvedValue('<html><body>Mocked Body</body></html>'),
            title: vi.fn().mockResolvedValue('Gemini'),
            screenshot: vi.fn().mockResolvedValue(undefined),
        } as unknown as MockPage;

        client = new GeminiClient(mockPage as unknown as Page, { verbose: false });
        // @ts-ignore
        client.dumpState = vi.fn();
    });

// start snippet should-be-defined

    it('should be defined', () => {
        expect(GeminiClient).toBeDefined();
    });

// end snippet should-be-defined

    describe('init', () => {

// start snippet should-navigate-to-the-base-url-if-no-session-id-i
        it('should navigate to the base URL if no session ID is provided', async () => {
            await client.init();
            expect(mockPage.goto).toHaveBeenCalledWith('https://gemini.google.com/app', { waitUntil: 'domcontentloaded' });
        });

// end snippet should-navigate-to-the-base-url-if-no-session-id-i

// start snippet should-navigate-to-the-specific-session-url-if-an-

        it('should navigate to the specific session URL if an ID is provided', async () => {
            await client.init('test-session-id');
            expect(mockPage.goto).toHaveBeenCalledWith('https://gemini.google.com/app/test-session-id', { waitUntil: 'domcontentloaded' });
        });

// end snippet should-navigate-to-the-specific-session-url-if-an-

// start snippet should-handle-and-click-cookie-consent-button

        it('should handle and click cookie consent button', async () => {
            const mockCookieButton = createMockLocator(true);
            mockPage.locator.mockImplementation((selector) => {
                if (selector.includes('Accept all')) {
                    return mockCookieButton;
                }
                return createMockLocator(false); // Hide other buttons
            });

            await client.init();
            expect(mockCookieButton.click).toHaveBeenCalled();
        });

// end snippet should-handle-and-click-cookie-consent-button

// start snippet should-handle-and-click-dismiss-buttons-for-popups

        it('should handle and click dismiss buttons for popups', async () => {
            const mockDismissButton = createMockLocator(true);
            mockPage.locator.mockImplementation((selector) => {
                if (selector.includes('No thanks')) {
                    return mockDismissButton;
                }
                return createMockLocator(false);
            });

            await client.init();
            expect(mockDismissButton.click).toHaveBeenCalled();
        });

// end snippet should-handle-and-click-dismiss-buttons-for-popups

// start snippet should-throw-an-error-if-a-sign-in-button-is-detec

        it('should throw an error if a sign-in button is detected', async () => {
            mockPage.locator.mockImplementation((selector) => {
                if (selector.includes('Sign in')) {
                    return createMockLocator(true);
                }
                return createMockLocator(false);
            });

            await expect(client.init()).rejects.toThrow('Gemini requires authentication. Please run rsrch auth first.');
            expect(client.dumpState).toHaveBeenCalledWith('gemini_auth_required');

        });

// end snippet should-throw-an-error-if-a-sign-in-button-is-detec

// start snippet should-wait-for-the-chat-interface-to-be-ready

        it('should wait for the chat interface to be ready', async () => {
            await client.init();
            expect(mockPage.waitForSelector).toHaveBeenCalledWith(
                'chat-app, .input-area, textarea, div[contenteditable="true"], rich-textarea, .chat-input, [data-input-container]',
                { timeout: 15000 }
            );
        });

// end snippet should-wait-for-the-chat-interface-to-be-ready

// start snippet should-throw-an-error-if-chat-interface-is-not-fou

        it('should throw an error if chat interface is not found', async () => {
            mockPage.waitForSelector.mockRejectedValue(new Error('Timeout'));
            // also make sidebar invisible
            mockPage.locator.mockImplementation(() => createMockLocator(false));

            await expect(client.init()).rejects.toThrow('Timeout');
            expect(client.dumpState).toHaveBeenCalledWith('gemini_init_fail');
        });

// end snippet should-throw-an-error-if-chat-interface-is-not-fou
    });

    describe('sendMessage', () => {

// start snippet should-fill-the-input-press-enter-and-wait-for-a-r
        it('should send a message and wait for a response', async () => {
            const message = 'Hello, Gemini!';
            const mockInput = createMockLocator(true, '');
            // injectText reads innerText to check if empty
            mockInput.innerText = vi.fn().mockResolvedValue('');
            
            // Track state to simulate response appearing
            let sent = false;
            
            const modelResponseLoc = createMockLocator(false, 'Response text');
            // Override count with logging
            modelResponseLoc.count = vi.fn().mockImplementation(() => {
                const c = sent ? 1 : 0;
                console.log(`[DEBUG] Response count: ${c} (sent=${sent})`);
                return Promise.resolve(c);
            });
            modelResponseLoc.nth = vi.fn().mockImplementation((i) => {
                console.log(`[DEBUG] nth(${i}) called`);
                return modelResponseLoc;
            });
            modelResponseLoc.last = vi.fn().mockReturnValue(modelResponseLoc);

            mockPage.locator.mockImplementation((selector) => {
                const sel = selector.toLowerCase();
                if (sel.includes('sign in')) {
                    return createMockLocator(false);
                }
                if (sel.includes('contenteditable') || sel.includes('rich-textarea') || sel.includes('chat-input') || sel.includes('input')) {
                    mockInput.press = vi.fn().mockImplementation(async (key) => {
                        if (key === 'Enter') {
                            sent = true;
                        }
                        return Promise.resolve();
                    });
                    return mockInput;
                }
                if (sel.includes('model-response') || sel.includes('response')) {
                    const loc = createMockLocator(sent, 'Response text');
                    loc.count = vi.fn().mockImplementation(() => Promise.resolve(sent ? 1 : 0));
                    loc.nth = vi.fn().mockReturnValue(loc);
                    loc.last = vi.fn().mockReturnValue(loc);
                    return loc;
                }
                if (sel.includes('send') || sel.includes('odeslat')) {
                    const sendBtn = createMockLocator(true);
                    sendBtn.click = vi.fn().mockImplementation(async () => {
                        sent = true;
                        return Promise.resolve();
                    });
                    return sendBtn;
                }
                return createMockLocator(false);
            });

            // Mock getLatestResponseData on this instance only
            vi.spyOn(client, 'getLatestResponseData').mockImplementation(async () => {
                return {
                    text: 'Response text',
                    markdown: 'Response text',
                    sources: []
                } as any;
            });

            const response = await client.sendMessage(message) as any;

            // Ensure input was interacted with
            expect(mockInput.click).toHaveBeenCalled();
            expect(response).toBe('Response text');
        });

// end snippet should-fill-the-input-press-enter-and-wait-for-a-r

// start snippet should-return-null-if-waitforresponse-is-false

        it('should return null if waitForResponse is false', async () => {
            const message = 'Fire and forget';
            const mockInput = createMockLocator(true);
            mockInput.innerText = vi.fn().mockResolvedValue('');

            mockPage.locator.mockImplementation((selector) => {
                if (selector.includes('Sign in')) {
                    return createMockLocator(false);
                }
                if (selector.includes('contenteditable') || selector.includes('rich-textarea') || selector.includes('chat-input')) {
                    return mockInput;
                }
                if (selector.includes('send') || selector.includes('Send') || selector.includes('Odeslat')) {
                    return createMockLocator(true);
                }
                if (selector.includes('model-response')) {
                    return createMockLocator(false);
                }
                return createMockLocator(false);
            });

            const response = await client.sendMessage(message, { waitForResponse: false });
            expect(response).toBeNull();
        });

// end snippet should-return-null-if-waitforresponse-is-false

// start snippet should-return-null-and-log-an-error-if-sending-fai

        it('should return null and log an error if sending fails', async () => {
            const message = 'This will fail';
            const mockInput = createMockLocator(true);
            mockInput.press.mockRejectedValue(new Error('Send failed')); // Simulate failure

            mockPage.locator.mockImplementation((selector) => {
                if (selector.includes('div[contenteditable="true"]')) {
                    return mockInput;
                }
                return createMockLocator(false);
            });

            const response = await client.sendMessage(message);

            expect(response).toBeNull();
            expect(client.dumpState).toHaveBeenCalledWith('send_message_fail');
        });

// end snippet should-return-null-and-log-an-error-if-sending-fai

// start snippet should-handle-response-stabilization

        it('should handle response stabilization', async () => {
            const mockInput = createMockLocator(true);
            mockInput.innerText = vi.fn().mockResolvedValue('');
            const mockResponse = createMockLocator(true, 'Initial response');
            mockResponse.last = vi.fn().mockReturnThis();

            let responseCallCount = 0;

            mockPage.locator.mockImplementation((selector) => {
                if (selector.includes('Sign in')) {
                    return createMockLocator(false); // Not signed out
                }
                if (selector.includes('contenteditable') || selector.includes('rich-textarea') || selector.includes('chat-input')) {
                    return mockInput;
                }
                if (selector.includes('model-response')) {
                    responseCallCount++;
                    const loc = createMockLocator(true, 'Initial response');
                    // First call returns 0 (before send), then 1 (response appeared)
                    loc.count = vi.fn().mockResolvedValue(responseCallCount > 1 ? 1 : 0);
                    loc.last = vi.fn().mockReturnThis();
                    loc.nth = vi.fn().mockReturnThis();
                    // Simulate stabilization: text grows then stabilizes
                    loc.innerText = vi.fn()
                        .mockResolvedValueOnce('Initial response')
                        .mockResolvedValueOnce('Initial response, more text')
                        .mockResolvedValueOnce('Initial response, more text')
                        .mockResolvedValue('Initial response, more text');
                    return loc;
                }
                if (selector.includes('send') || selector.includes('Send') || selector.includes('Odeslat')) {
                    return createMockLocator(true);
                }
                return createMockLocator(false);
            });

            await client.sendMessage('test');

            // waitForTimeout is called for stabilization checks
            expect(mockPage.waitForTimeout).toHaveBeenCalled();
        });

// end snippet should-handle-response-stabilization
    });

    describe('Response Parsing', () => {

// start snippet getresponses-should-return-an-array-of-all-respons
        it('getResponses should return an array of all response texts', async () => {
            const mockResponses = {
                count: vi.fn().mockResolvedValue(3),
                nth: vi.fn((i) => {
                    if (i === 0) return createMockLocator(true, 'Response 1');
                    if (i === 1) return createMockLocator(true, 'Response 2');
                    if (i === 2) return createMockLocator(true, 'Response 3');
                    return createMockLocator(false);
                }),
            };
            mockPage.locator.mockReturnValue(mockResponses);

            const responses = await client.getResponses();
            expect(responses).toEqual(['Response 1', 'Response 2', 'Response 3']);
            expect(mockResponses.nth).toHaveBeenCalledTimes(3);
        });

// end snippet getresponses-should-return-an-array-of-all-respons

// start snippet getlatestresponse-should-return-the-text-of-the-la

        it('getLatestResponse should return the text of the last response', async () => {
            const mockResponses = createMockLocator(true, 'This is the last one');
            mockResponses.count = vi.fn().mockResolvedValue(2);
            mockResponses.nth = vi.fn().mockImplementation((i) => {
                if (i === 1) return createMockLocator(true, 'This is the last one');
                return createMockLocator(true, 'First response');
            });

            mockPage.locator.mockImplementation(selector => {
                if (selector.includes('model-response')) {
                    return mockResponses;
                }
                return createMockLocator(false);
            });

            const latest = await client.getLatestResponse();
            expect(latest).toBe('This is the last one');
            expect(mockResponses.nth).toHaveBeenCalledWith(1);
        });

// end snippet getlatestresponse-should-return-the-text-of-the-la

// start snippet getlatestresponse-should-return-null-if-no-respons


        it('getLatestResponse should return null if no responses are found', async () => {
            mockPage.locator.mockReturnValue(createMockLocator(false));
            const latest = await client.getLatestResponse();
            expect(latest).toBeNull();
        });

// end snippet getlatestresponse-should-return-null-if-no-respons

// start snippet getresponse-should-retrieve-responses-by-positive-

        it('getResponse should retrieve responses by positive and negative index', async () => {
            const mockResponses = {
                count: vi.fn().mockResolvedValue(3),
                nth: vi.fn((i) => {
                    if (i === 0) return createMockLocator(true, 'First');
                    if (i === 1) return createMockLocator(true, 'Second');
                    if (i === 2) return createMockLocator(true, 'Third');
                    return createMockLocator(false);
                }),
            };
            mockPage.locator.mockReturnValue(mockResponses);

            // Test positive index (1-based)
            expect(await client.getResponse(1)).toBe('First');
            expect(await client.getResponse(3)).toBe('Third');

            // Test negative index
            expect(await client.getResponse(-1)).toBe('Third');
            expect(await client.getResponse(-3)).toBe('First');

            // Test out of bounds
            expect(await client.getResponse(4)).toBeNull();
            expect(await client.getResponse(-4)).toBeNull();
        });

// end snippet getresponse-should-retrieve-responses-by-positive-
    });

    describe('Error Handling', () => {

// start snippet listsessions-should-return-an-empty-array-on-failu
        it('listSessions should return an empty array on failure', async () => {
            mockPage.locator.mockImplementation(() => {
                throw new Error('Failed to find session list');
            });
            const sessions = await client.listSessions();
            expect(sessions).toEqual([]);
        });

// end snippet listsessions-should-return-an-empty-array-on-failu

// start snippet getlatestresponse-should-return-null-on-failure

        it('getLatestResponse should return null on failure', async () => {
            mockPage.locator.mockImplementation(() => {
                const locator = createMockLocator(true);
                // getLatestResponseData uses evaluate, so we must mock that to fail for null response
                locator.evaluate.mockRejectedValue(new Error('Mock evaluation error'));
                return locator;
            });
            const response = await client.getLatestResponse();
            expect(response).toBeNull();
        });

// end snippet getlatestresponse-should-return-null-on-failure

// start snippet exporttogoogledocs-should-return-null-values-on-fa

        it('exportToGoogleDocs should return null values on failure', async () => {
            mockPage.locator.mockImplementation((selector) => {
                // Make export button not visible/found
                if (selector.includes('Export menu') || selector.includes('Nabídka pro export')) {
                    return createMockLocator(false);
                }
                return createMockLocator(true);
            });

            const result = await client.exportCurrentToGoogleDocs();
            expect(result).toEqual({ docId: null, docUrl: null, docTitle: null });
            expect(client.dumpState).toHaveBeenCalledWith('export_button_not_found');
        });

// end snippet exporttogoogledocs-should-return-null-values-on-fa
    });

    describe('Retry and Polling Logic', () => {

// start snippet listsessions-should-scroll-to-load-more-sessions-i
        it('listSessions should scroll to load more sessions if initial count is less than target', async () => {
            let callCount = 0;
            const mockSessionLocator = {
                ...createMockLocator(true, 'Session'),
                count: vi.fn(() => {
                    callCount++;
                    return Promise.resolve(callCount === 1 ? 10 : 20);
                }),
                last: vi.fn().mockReturnThis(),
                scrollIntoViewIfNeeded: vi.fn().mockResolvedValue(undefined),
            };

            mockPage.locator.mockImplementation((selector) => {
                if (selector.includes('div.conversation')) {
                    return mockSessionLocator;
                }
                if (selector.includes('Show more')) {
                    return createMockLocator(false);
                }
                return createMockLocator(true);
            });

            await client.listSessions(20, 0);

            expect(mockSessionLocator.scrollIntoViewIfNeeded).toHaveBeenCalled();
            expect(mockSessionLocator.count).toHaveBeenCalledTimes(2);
        });

// end snippet listsessions-should-scroll-to-load-more-sessions-i

// start snippet listsessions-should-click-show-more-button-if-visi

        it('listSessions should click "Show more" button if visible', async () => {
            const mockSessionLocator = createMockLocator(true, 'Session');
            mockSessionLocator.count.mockResolvedValue(5);
            const mockShowMoreButton = createMockLocator(true);

            mockPage.locator.mockImplementation((selector) => {
                if (selector.includes('div.conversation')) {
                    return mockSessionLocator;
                }
                if (selector.includes('Show more') || selector.includes('Zobrazit více')) {
                    return mockShowMoreButton;
                }
                return createMockLocator(false);
            });

            await client.listSessions(10, 0);

            expect(mockShowMoreButton.click).toHaveBeenCalled();
        });

// end snippet listsessions-should-click-show-more-button-if-visi
    });
});
