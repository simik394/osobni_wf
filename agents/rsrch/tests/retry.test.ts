import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WindmillClient } from '../src/windmill-client';
import { GraphStore, getGraphStore } from '../src/graph-store';
import { ApiError, NetworkError, AuthError } from '../src/errors';
import { FalkorDB } from 'falkordb';

// Mock fetch
global.fetch = vi.fn();

describe('WindmillClient Error Handling and Retry Logic', () => {

    beforeEach(() => {
        vi.resetAllMocks();
    });

// start snippet should-succeed-on-the-first-attempt

    it('should succeed on the first attempt', async () => {
        const client = new WindmillClient();
        (fetch as vi.Mock).mockResolvedValueOnce({
            ok: true,
            text: async () => 'job-123',
        });

        const result = await client.triggerAudioGeneration({ notebookTitle: 'test', sourceTitle: 'test' });
        expect(result.success).toBe(true);
        expect(result.jobId).toBe('job-123');
        expect(fetch).toHaveBeenCalledTimes(1);
    });

// end snippet should-succeed-on-the-first-attempt

// start snippet should-retry-on-transient-server-errors-and-eventu

    it('should retry on transient server errors and eventually succeed', async () => {
        const client = new WindmillClient();
        (fetch as vi.Mock)
            .mockResolvedValueOnce({ ok: false, status: 503, statusText: 'Service Unavailable', text: async () => 'error' })
            .mockResolvedValueOnce({ ok: false, status: 429, statusText: 'Too Many Requests', text: async () => 'error' })
            .mockResolvedValueOnce({ ok: true, text: async () => 'job-123' });

        const result = await client.triggerAudioGeneration({ notebookTitle: 'test', sourceTitle: 'test' });
        expect(result.success).toBe(true);
        expect(result.jobId).toBe('job-123');
        expect(fetch).toHaveBeenCalledTimes(3);
    });

// end snippet should-retry-on-transient-server-errors-and-eventu

// start snippet should-fail-after-max-retries-on-persistent-server

    it('should fail after max retries on persistent server errors', async () => {
        const client = new WindmillClient();
        (fetch as vi.Mock).mockResolvedValue({
            ok: false,
            status: 500,
            statusText: 'Internal Server Error',
            text: async () => 'server-error',
        });

        const result = await client.triggerAudioGeneration({ notebookTitle: 'test', sourceTitle: 'test' });
        expect(result.success).toBe(false);
        expect(result.error).toContain('API error (status 500): server-error');
        expect(fetch).toHaveBeenCalledTimes(4);
    }, 8000);

// end snippet should-fail-after-max-retries-on-persistent-server

// start snippet should-fail-immediately-on-non-retriable-client-er

    it('should fail immediately on non-retriable client errors (e.g., 400)', async () => {
        const client = new WindmillClient();
        (fetch as vi.Mock).mockResolvedValueOnce({
            ok: false,
            status: 400,
            statusText: 'Bad Request',
            text: async () => 'bad-request',
        });

        const result = await client.triggerAudioGeneration({ notebookTitle: 'test', sourceTitle: 'test' });
        expect(result.success).toBe(false);
        expect(result.error).toContain('API error (status 400): bad-request');
        expect(fetch).toHaveBeenCalledTimes(1);
    });

// end snippet should-fail-immediately-on-non-retriable-client-er

// start snippet should-handle-request-timeouts-and-retry

    it('should handle request timeouts and retry', async () => {
        const client = new WindmillClient();
        (fetch as vi.Mock)
            .mockRejectedValueOnce(new DOMException('The user aborted a request.', 'AbortError')) // Simulate timeout
            .mockResolvedValueOnce({ ok: true, text: async () => 'job-123' });

        const result = await client.triggerAudioGeneration({ notebookTitle: 'test', sourceTitle: 'test' });
        expect(result.success).toBe(true);
        expect(result.jobId).toBe('job-123');
        expect(fetch).toHaveBeenCalledTimes(2);
    });

// end snippet should-handle-request-timeouts-and-retry
});


describe('GraphStore Resilience', () => {
    vi.mock('falkordb', () => {
        const mockGraph = {
            query: vi.fn(),
        };
        const mockClient = {
            selectGraph: vi.fn(() => mockGraph),
            close: vi.fn(),
        };
        return {
            FalkorDB: {
                connect: vi.fn(() => Promise.resolve(mockClient)),
            },
        };
    });

    let graphStore: GraphStore;
    const mockConnect = FalkorDB.connect as vi.Mock;
    let mockQuery: vi.Mock;


    beforeEach(() => {
        vi.resetAllMocks();
        graphStore = new GraphStore(); // Use a fresh instance for each test
        const mockClient = {
            selectGraph: () => ({ query: vi.fn() }),
            close: vi.fn(),
        };
        mockConnect.mockResolvedValue(mockClient);
        // This is tricky because the graph instance is created inside connect.
        // We will mock the query function after connection.
    });

// start snippet should-connect-successfully-on-the-first-attempt

    it('should connect successfully on the first attempt', async () => {
        await graphStore.connect();
        expect(mockConnect).toHaveBeenCalledTimes(1);
        expect((graphStore as any).isConnected).toBe(true);
    });

// end snippet should-connect-successfully-on-the-first-attempt

// start snippet should-retry-connection-and-eventually-succeed

    it('should retry connection and eventually succeed', async () => {
        mockConnect
            .mockRejectedValueOnce(new Error('Connection failed'))
            .mockResolvedValueOnce({ selectGraph: () => ({ query: vi.fn() }), close: vi.fn() });

        await graphStore.connect('localhost', 6379, 2);
        expect(mockConnect).toHaveBeenCalledTimes(2);
        expect((graphStore as any).isConnected).toBe(true);
    });

// end snippet should-retry-connection-and-eventually-succeed

// start snippet should-fail-to-connect-after-max-retries

    it('should fail to connect after max retries', async () => {
        mockConnect.mockRejectedValue(new Error('Persistent connection failure'));
        await expect(graphStore.connect('localhost', 6379, 2)).rejects.toThrow(NetworkError);
        expect(mockConnect).toHaveBeenCalledTimes(2);
        expect((graphStore as any).isConnected).toBe(false);
    });

// end snippet should-fail-to-connect-after-max-retries

// start snippet should-trip-circuit-breaker-after-enough-consecuti

    it('should trip circuit breaker after enough consecutive failures', async () => {
        await graphStore.connect();
        // @ts-ignore - Access private method for mocking
        mockQuery = graphStore.graph.query;
        mockQuery.mockRejectedValue(new Error('Query failed'));

        // Trigger failures to trip the circuit
        for (let i = 0; i < 5; i++) {
            await expect((graphStore as any)._executeQuery('FAIL')).rejects.toThrow();
        }

        // Now the circuit should be open
        await expect((graphStore as any)._executeQuery('FAIL')).rejects.toThrow('circuit breaker is open');
    });

// end snippet should-trip-circuit-breaker-after-enough-consecuti

// start snippet should-transition-from-open-to-half-open-and-then-

    it('should transition from OPEN to HALF_OPEN and then to CLOSED', async () => {
        await graphStore.connect();
        // @ts-ignore
        mockQuery = graphStore.graph.query;
        mockQuery.mockClear(); // Clear calls from initSchema

        mockQuery.mockRejectedValue(new Error('Query failed'));

        // Trip the circuit
        for (let i = 0; i < 5; i++) {
            await expect((graphStore as any)._executeQuery('FAIL')).rejects.toThrow();
        }

        // It is now OPEN. Wait for reset timeout.
        // @ts-ignore - access private property
        graphStore.lastFailure = Date.now() - 31000;

        // First call should be in HALF_OPEN. Let it succeed.
        mockQuery.mockResolvedValue({ data: [] });
        await (graphStore as any)._executeQuery('SUCCESS');

        // Now it should be CLOSED. Let it succeed again.
        await (graphStore as any)._executeQuery('SUCCESS');
        // 5 failures + 1 HALF_OPEN success (which transitions to CLOSED) = 6 total calls
        // Note: The second SUCCESS doesn't increment because circuit resets call tracking
        expect(mockQuery).toHaveBeenCalledTimes(7);
    });

// end snippet should-transition-from-open-to-half-open-and-then-
});
