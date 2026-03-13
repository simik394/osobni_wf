import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GeminiClient, Source } from '../src/gemini-client';
import { selectors } from '../src/selectors';

describe('GeminiClient Content Injection', () => {
    let client: GeminiClient;
    let mockPage: any;
    let mockLocator: any;

    beforeEach(() => {
        vi.clearAllMocks();

        // Create recursive mock locator
        mockLocator = {
            first: vi.fn(),
            last: vi.fn(),
            waitFor: vi.fn().mockResolvedValue(undefined),
            click: vi.fn().mockResolvedValue(undefined),
            fill: vi.fn().mockResolvedValue(undefined),
            pressSequentially: vi.fn().mockResolvedValue(undefined),
            innerText: vi.fn().mockResolvedValue(''),
            count: vi.fn().mockResolvedValue(1),
            isVisible: vi.fn().mockResolvedValue(true),
            setInputFiles: vi.fn().mockResolvedValue(undefined),
            getByRole: vi.fn(),
        };
        mockLocator.first.mockReturnValue(mockLocator);
        mockLocator.last.mockReturnValue(mockLocator);
        mockLocator.getByRole.mockReturnValue(mockLocator);

        mockPage = {
            locator: vi.fn().mockReturnValue(mockLocator),
            getByRole: vi.fn().mockReturnValue(mockLocator),
            waitForTimeout: vi.fn().mockResolvedValue(undefined),
            keyboard: {
                press: vi.fn().mockResolvedValue(undefined),
                down: vi.fn().mockResolvedValue(undefined),
                up: vi.fn().mockResolvedValue(undefined),
                type: vi.fn().mockResolvedValue(undefined),
            },
            evaluate: vi.fn(),
            url: vi.fn().mockReturnValue('https://gemini.google.com/app'),
        };

        client = new GeminiClient(mockPage);
    });

    it('should inject text correctly', async () => {
        const text = 'Hello world';

        await client.injectText(text);

        expect(mockPage.locator).toHaveBeenCalledWith(selectors.gemini.chat.input);
        expect(mockLocator.click).toHaveBeenCalled();
        if (text.length > 50) {
             expect(mockLocator.pressSequentially).toHaveBeenCalledWith(text, expect.anything());
        } else {
             expect(mockPage.keyboard.type).toHaveBeenCalledWith(text);
        }
    });

    it('should inject URL correctly', async () => {
        const url = 'https://example.com';

        await client.injectUrl(url);

        expect(mockPage.keyboard.type).toHaveBeenCalledWith(url);
        // Expect wait for preview
        expect(mockPage.waitForTimeout).toHaveBeenCalledWith(3000);
    });

    it('should inject multiple sources', async () => {
        const sources: Source[] = [
            { type: 'text', content: 'Context' },
            { type: 'url', content: 'https://example.com' },
            { type: 'file', content: '/path/to/file.pdf' }
        ];

        // Mock uploadFiles since it relies on complex UI interactions we don't want to test here
        const uploadFilesSpy = vi.spyOn(client, 'uploadFiles').mockResolvedValue(true);
        // Mock injectUrl and injectText to verify order/calls without implementation details
        const injectUrlSpy = vi.spyOn(client, 'injectUrl').mockResolvedValue(undefined);
        const injectTextSpy = vi.spyOn(client, 'injectText').mockResolvedValue(undefined);

        await client.injectSources(sources);

        expect(uploadFilesSpy).toHaveBeenCalledWith(['/path/to/file.pdf']);
        expect(injectTextSpy).toHaveBeenCalledWith('Context');
        expect(injectUrlSpy).toHaveBeenCalledWith('https://example.com');
    });
});
