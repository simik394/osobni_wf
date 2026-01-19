
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { WindmillClient } from '../src/windmill-client';

const WINDMILL_URL = 'http://localhost:8000';
const WORKSPACE = 'knowlage';
const TOKEN = 'test-token';

process.env.WINDMILL_URL = WINDMILL_URL;
process.env.WINDMILL_WORKSPACE = WORKSPACE;
process.env.WINDMILL_TOKEN = TOKEN;

const server = setupServer();

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('WindmillClient', () => {
    let client: WindmillClient;

    beforeEach(() => {
        client = new WindmillClient();
    });

    it('should be configured', () => {
        expect(client.isConfigured()).toBe(true);
    });

    it('should list jobs', async () => {
        const mockJobs = [{ id: '123', status: 'completed' }];
        server.use(
            http.get(`${WINDMILL_URL}/api/w/${WORKSPACE}/jobs_u/list`, ({ request }) => {
                const url = new URL(request.url);
                expect(url.searchParams.get('per_page')).toBe('10');
                return HttpResponse.json(mockJobs);
            })
        );

        const jobs = await client.listJobs(10);
        expect(jobs).toEqual(mockJobs);
    });

    it('should execute job (blocking)', async () => {
        const jobId = 'job-123';
        const jobResult = { success: true, result: { foo: 'bar' } };

        server.use(
            // Trigger
            http.post(`${WINDMILL_URL}/api/w/${WORKSPACE}/jobs/run/p/test/script`, () => {
                return new HttpResponse(jobId);
            }),
            // Poll result (first time pending, second time completed)
            http.get(`${WINDMILL_URL}/api/w/${WORKSPACE}/jobs_u/completed/get_result/${jobId}`, () => {
                return HttpResponse.json(jobResult);
            })
        );

        const result = await client.executeJob('test/script', { foo: 'bar' }, true);
        expect(result).toEqual(jobResult.result);
    });

    it('should execute job (non-blocking)', async () => {
        const jobId = 'job-456';

        server.use(
            http.post(`${WINDMILL_URL}/api/w/${WORKSPACE}/jobs/run/p/test/script`, () => {
                return new HttpResponse(jobId);
            })
        );

        const result = await client.executeJob('test/script', { foo: 'bar' }, false);
        expect(result.jobId).toBe(jobId);
        expect(result.success).toBe(true);
    });

    it('should create schedule', async () => {
        const scheduleId = 'sched-123';
        server.use(
            http.post(`${WINDMILL_URL}/api/w/${WORKSPACE}/schedules/create`, async ({ request }) => {
                const body = await request.json() as any;
                expect(body.schedule).toBe('*/5 * * * *');
                expect(body.path).toBe('test/script');
                return new HttpResponse(scheduleId);
            })
        );

        const id = await client.createSchedule('test/script', '*/5 * * * *');
        expect(id).toBe(scheduleId);
    });
});
