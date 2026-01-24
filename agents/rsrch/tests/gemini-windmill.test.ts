
import { GeminiClient } from '../src/gemini-client';
import { Page } from 'playwright';
import { vi, describe, it, expect, beforeEach, Mock } from 'vitest';
import * as WindmillClientModule from '../src/windmill-client';

// Mock WindmillClient module
const mockTriggerGemini = vi.fn();
const mockWaitForJob = vi.fn();
const mockIsConfigured = vi.fn();

// We need to return a factory that produces these mocks
vi.mock('../src/windmill-client', () => {
    return {
        getWindmillClient: vi.fn()
    };
});

describe('GeminiClient Windmill Integration', () => {
    let client: GeminiClient;
    let mockPage: any;

    beforeEach(() => {
        vi.clearAllMocks();
        // Restore implementation because vitest.config.ts has mockReset: true
        vi.mocked(WindmillClientModule.getWindmillClient).mockImplementation(() => ({
            triggerGeminiInteraction: mockTriggerGemini,
            waitForJob: mockWaitForJob,
            isConfigured: mockIsConfigured,
        }));

        mockPage = {
            goto: vi.fn(),
            screenshot: vi.fn(),
        } as any;
        client = new GeminiClient(mockPage as Page, { verbose: false });
        // @ts-ignore
        client.dumpState = vi.fn();
    });// #region test:queryviawindmill-should-delegate-to-windmillclient



    it('queryViaWindmill should delegate to WindmillClient when configured', async () => {
        const query = 'Test Query';
        const expectedResponse = 'Windmill Response';

        mockIsConfigured.mockReturnValue(true);
        // trigger returns job ID
        mockTriggerGemini.mockResolvedValue({ jobId: 'job-123' });
        // waitForJob returns the result
        mockWaitForJob.mockResolvedValue({
            success: true,
            result: {
                success: true,
                response: expectedResponse,
                session_id: 'new-session-id'
            }
        });

        const result = await client.queryViaWindmill(query);

        expect(mockIsConfigured).toHaveBeenCalled();
        expect(mockTriggerGemini).toHaveBeenCalledWith({
            message: query,
            session_id: undefined,
            model: 'pro',
            waitForResponse: true
        });
        expect(mockWaitForJob).toHaveBeenCalledWith('job-123');
        expect(result).toBe(expectedResponse);
    });

// #endregion test:queryviawindmill-should-delegate-to-windmillclient// #region test:queryviawindmill-should-pass-session-id-and-model



    it('queryViaWindmill should pass session ID and model', async () => {
        mockIsConfigured.mockReturnValue(true);
        mockTriggerGemini.mockResolvedValue({ jobId: 'job-456' });
        mockWaitForJob.mockResolvedValue({
            success: true,
            result: { success: true, response: 'ok' }
        });

        await client.queryViaWindmill('Hello', 'sess-123', 'thinking');

        expect(mockTriggerGemini).toHaveBeenCalledWith({
            message: 'Hello',
            session_id: 'sess-123',
            model: 'thinking',
            waitForResponse: true
        });
    });

// #endregion test:queryviawindmill-should-pass-session-id-and-model// #region test:queryviawindmill-should-throw-if-windmill-is-not-c



    it('queryViaWindmill should throw if Windmill is not configured', async () => {
        mockIsConfigured.mockReturnValue(false);
        await expect(client.queryViaWindmill('fail')).rejects.toThrow('Windmill is not configured');
    });

// #endregion test:queryviawindmill-should-throw-if-windmill-is-not-c// #region test:queryviawindmill-should-throw-if-job-fails-interna



    it('queryViaWindmill should throw if job fails internally', async () => {
        mockIsConfigured.mockReturnValue(true);
        mockTriggerGemini.mockResolvedValue({ jobId: 'job-789' });
        mockWaitForJob.mockResolvedValue({
            success: true,
            result: { success: false, error: 'Script Error' }
        });

        await expect(client.queryViaWindmill('fail')).rejects.toThrow('Script Error');
    });

// #endregion test:queryviawindmill-should-throw-if-job-fails-interna
});
