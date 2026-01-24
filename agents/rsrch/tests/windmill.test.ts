
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

// Scripts to test
import { main as clickGenerateAudio } from '../windmill/click_generate_audio';
import { main as watchAudioCompletion } from '../windmill/watch_audio_completion';
import { main as getSourcesWithoutAudio } from '../windmill/get_sources_without_audio';
import { main as notifyAudioComplete } from '../windmill/notify_audio_complete';

const RSRCH_URL = 'http://localhost:3080';
const NTFY_URL = 'https://ntfy.sh';
const NTFY_TOPIC = 'rsrch-audio-test';

const server = setupServer();

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('Windmill Scripts', () => {

  describe('click_generate_audio', () => {

// start snippet should-trigger-audio-generation-and-update-graph-s
    it('should trigger audio generation and update graph state', async () => {
      // Mock graph execute calls
      server.use(
        http.post(`${RSRCH_URL}/graph/execute`, async ({ request }) => {
          const body = await request.json();
          if (body.query.includes('CREATE (pa:PendingAudio')) {
            return HttpResponse.json({ notebookId: 'notebook-123' });
          }
          return HttpResponse.json({});
        }),
        http.post(`${RSRCH_URL}/notebooklm/generate-audio`, () => {
          return HttpResponse.json({ success: true });
        }),
        http.post(`${NTFY_URL}/${NTFY_TOPIC}`, () => {
          return new HttpResponse(null, { status: 200 });
        })
      );

      const result = await clickGenerateAudio({
        notebook_title: 'My Notebook',
        source_title: 'My Source',
      });

      expect(result.success).toBe(true);
      expect(result.notebook_id).toBe('notebook-123');
      expect(result.source_title).toBe('My Source');
      expect(result.pending_audio_id).toMatch(/^pending_audio_/);
    });

// end snippet should-trigger-audio-generation-and-update-graph-s
  });

  describe('watch_audio_completion', () => {

// start snippet should-match-a-completed-audio-file-and-update-the
    it('should match a completed audio file and update the graph', async () => {
      const pendingAudio = {
        id: 'pending-123',
        notebookId: 'notebook-123',
        sourceTitle: 'A very long source title that will be truncated',
        startedAt: Date.now() - 10000,
      };

      const completedAudio = {
        id: 'audio-456',
        title: 'Audio for "A very long source title..."',
        sourceCount: 1,
        correlationId: pendingAudio.id,
      };

      // Mock fetching pending nodes
      server.use(
        http.post(`${RSRCH_URL}/graph/execute`, async ({ request }) => {
          const body = await request.json();
          if (body.query.includes('MATCH (pa:PendingAudio')) {
            return HttpResponse.json([
              [pendingAudio.id, pendingAudio.notebookId, pendingAudio.sourceTitle, pendingAudio.startedAt]
            ]);
          }
           // Mock the update query
          if (body.query.includes('DETACH DELETE pa')) {
            return HttpResponse.json({ success: true });
          }
          return HttpResponse.json({});
        }),
        // Mock fetching notebook data
        http.post(`${RSRCH_URL}/notebook/list`, () => {
          return HttpResponse.json({
            success: true,
            data: [{
              id: 'notebook-123',
              audioOverviews: [completedAudio],
            }],
          });
        }),
        // Mock ntfy notification
        http.post(`${NTFY_URL}/${NTFY_TOPIC}`, () => new HttpResponse(null, { status: 200 }))
      );

      const result = await watchAudioCompletion();

      expect(result.processed).toBe(1);
      expect(result.completed).toBe(1);
      expect(result.failed).toBe(0);
    });

// end snippet should-match-a-completed-audio-file-and-update-the
  });


  describe('get_sources_without_audio', () => {

// start snippet should-query-the-rsrch-server-and-return-sources
    it('should query the rsrch server and return sources', async () => {
        server.use(
            http.post(`${RSRCH_URL}/notebooklm/sources-without-audio`, () => {
                return HttpResponse.json({
                    sources: ['Source A', 'Source B'],
                });
            })
        );

        const result = await getSourcesWithoutAudio({ notebook_title: 'Test Book' });

        expect(result.total_count).toBe(2);
        expect(result.sources_without_audio).toEqual(['Source A', 'Source B']);
    });

// end snippet should-query-the-rsrch-server-and-return-sources
  });

  describe('notify_audio_complete', () => {

// start snippet should-send-a-success-notification-to-ntfy
    it('should send a success notification to ntfy', async () => {
        let requestBody = '';
        server.use(
            http.post(`${NTFY_URL}/${NTFY_TOPIC}`, async ({ request }) => {
                requestBody = await request.text();
                return new HttpResponse(null, { status: 200 });
            })
        );

        const result = await notifyAudioComplete({
            source_title: 'My Test Source',
            notebook_title: 'My Test Notebook',
            start_time: Date.now() - 5000,
            success: true,
            artifact_title: 'Audio for My Test Source',
        });

        expect(result.notification_sent).toBe(true);
        expect(requestBody).toContain('Audio generated in 0m 5s');
    });

// end snippet should-send-a-success-notification-to-ntfy
  });
});
