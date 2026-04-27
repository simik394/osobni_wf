/**
 * WindmillClient unit tests
 * Tests queue orchestration, trigger methods, error handling, and configuration.
 * Uses MSW (Mock Service Worker) for HTTP mocking.
 */
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

const WINDMILL_URL = 'http://localhost:8000';
const WORKSPACE = 'knowlage';

// MSW server
const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('WindmillClient', () => {
    let WindmillClient: any;

    beforeEach(async () => {
        // Reset modules to pick up env vars
        vi.resetModules();
        process.env.WINDMILL_TOKEN = 'test-token';
        process.env.WINDMILL_URL = WINDMILL_URL;
        process.env.WINDMILL_WORKSPACE = WORKSPACE;
        const mod = await import('../src/clients/windmill');
        WindmillClient = mod.WindmillClient;
    });

    afterEach(() => {
        delete process.env.WINDMILL_TOKEN;
        delete process.env.WINDMILL_URL;
        delete process.env.WINDMILL_WORKSPACE;
    });

    describe('isConfigured', () => {
        it('should return true when WINDMILL_TOKEN is set', () => {
            const client = new WindmillClient();
            expect(client.isConfigured()).toBe(true);
        });

        it('should return false when WINDMILL_TOKEN is empty', async () => {
            process.env.WINDMILL_TOKEN = '';
            vi.resetModules();
            const mod = await import('../src/clients/windmill');
            const client = new mod.WindmillClient();
            expect(client.isConfigured()).toBe(false);
        });
    });

    describe('triggerAudioGeneration', () => {
        it('should send correct request to Windmill API', async () => {
            let capturedBody: any;
            server.use(
                http.post(`${WINDMILL_URL}/api/w/${WORKSPACE}/jobs/run/p/f/audio/click_generate_audio`, async ({ request }) => {
                    capturedBody = await request.json();
                    return HttpResponse.text('"job-uuid-123"');
                })
            );

            const client = new WindmillClient();
            const result = await client.triggerAudioGeneration({
                notebookTitle: 'Test Notebook',
                sourceTitle: 'Test Source',
                customPrompt: 'Focus on key points'
            });

            expect(result.success).toBe(true);
            expect(result.jobId).toBe('job-uuid-123');
            expect(capturedBody.notebook_title).toBe('Test Notebook');
            expect(capturedBody.source_title).toBe('Test Source');
            expect(capturedBody.custom_prompt).toBe('Focus on key points');
        });

        it('should handle API failure gracefully', async () => {
            server.use(
                http.post(`${WINDMILL_URL}/api/w/${WORKSPACE}/jobs/run/p/f/audio/click_generate_audio`, () => {
                    return new HttpResponse('Internal Server Error', { status: 500 });
                })
            );

            const client = new WindmillClient();
            const result = await client.triggerAudioGeneration({
                notebookTitle: 'Test',
                sourceTitle: 'Test'
            });

            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
        });
    });

    describe('triggerSessionPublishing', () => {
        it('should trigger Jules session publishing', async () => {
            let capturedBody: any;
            server.use(
                http.post(`${WINDMILL_URL}/api/w/${WORKSPACE}/jobs/run/p/f/jules/click_publish_session`, async ({ request }) => {
                    capturedBody = await request.json();
                    return HttpResponse.text('"publish-job-456"');
                })
            );

            const client = new WindmillClient();
            const result = await client.triggerSessionPublishing({
                sessionId: 'session-abc',
                mode: 'pr'
            });

            expect(result.success).toBe(true);
            expect(result.jobId).toBe('publish-job-456');
            expect(capturedBody.session_id).toBe('session-abc');
            expect(capturedBody.mode).toBe('pr');
        });
    });

    describe('triggerGeminiInteraction', () => {
        it('should trigger Gemini chat via Windmill', async () => {
            let capturedBody: any;
            server.use(
                http.post(`${WINDMILL_URL}/api/w/${WORKSPACE}/jobs/run/p/f/rsrch/gemini_interaction`, async ({ request }) => {
                    capturedBody = await request.json();
                    return HttpResponse.text('"gemini-job-789"');
                })
            );

            const client = new WindmillClient();
            const result = await client.triggerGeminiInteraction({
                message: 'Hello world',
                model: 'thinking'
            });

            expect(result.success).toBe(true);
            expect(capturedBody.message).toBe('Hello world');
            expect(capturedBody.model).toBe('thinking');
        });
    });

    describe('triggerNotebookLMRenameSource', () => {
        it('should trigger source rename via Windmill', async () => {
            let capturedBody: any;
            server.use(
                http.post(`${WINDMILL_URL}/api/w/${WORKSPACE}/jobs/run/p/f/notebooklm/rename_source`, async ({ request }) => {
                    capturedBody = await request.json();
                    return HttpResponse.text('"rename-job-101"');
                })
            );

            const client = new WindmillClient();
            const result = await client.triggerNotebookLMRenameSource('My NB', 'Old Title', 'New Title');

            expect(result.success).toBe(true);
            expect(capturedBody.notebook_title).toBe('My NB');
            expect(capturedBody.old_title).toBe('Old Title');
            expect(capturedBody.new_title).toBe('New Title');
        });
    });

    describe('getJobStatus', () => {
        it('should fetch job status from Windmill', async () => {
            server.use(
                http.get(`${WINDMILL_URL}/api/w/${WORKSPACE}/jobs_u/get/job-123`, () => {
                    return HttpResponse.json({ id: 'job-123', status: 'completed', result: { ok: true } });
                })
            );

            const client = new WindmillClient();
            const status = await client.getJobStatus('job-123');

            expect(status.id).toBe('job-123');
            expect(status.status).toBe('completed');
        });

        it('should return error object on failure', async () => {
            server.use(
                http.get(`${WINDMILL_URL}/api/w/${WORKSPACE}/jobs_u/get/bad-id`, () => {
                    return new HttpResponse('Not Found', { status: 404 });
                })
            );

            const client = new WindmillClient();
            const status = await client.getJobStatus('bad-id');
            expect(status.error).toBeDefined();
        });
    });

    describe('queueSessionPublishing', () => {
        it('should queue multiple sessions', async () => {
            server.use(
                http.post(`${WINDMILL_URL}/api/w/${WORKSPACE}/jobs/run/p/f/jules/click_publish_session`, () => {
                    return HttpResponse.text(`"job-${Math.random().toString(36).slice(2)}"`);
                })
            );

            const client = new WindmillClient();
            const result = await client.queueSessionPublishing(['s1', 's2', 's3'], 'branch');

            expect(result.queued.length).toBe(3);
            expect(result.failed.length).toBe(0);
        });

        it('should track failed sessions', async () => {
            let callCount = 0;
            server.use(
                http.post(`${WINDMILL_URL}/api/w/${WORKSPACE}/jobs/run/p/f/jules/click_publish_session`, () => {
                    callCount++;
                    if (callCount === 2) {
                        // Use 401 (non-retriable) to ensure it fails immediately
                        return new HttpResponse('Unauthorized', { status: 401 });
                    }
                    return HttpResponse.text('"job-ok"');
                })
            );

            const client = new WindmillClient();
            const result = await client.queueSessionPublishing(['s1', 's2', 's3'], 'pr');

            expect(result.queued.length).toBe(2);
            expect(result.failed.length).toBe(1);
        });
    });
});
