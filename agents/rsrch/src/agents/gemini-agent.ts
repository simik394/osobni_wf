import { ResearchAgent, QueryOptions, Result, Session, Citation } from '../interfaces/research-agent';
import { GeminiClient } from '../gemini-client';
import { PerplexityClient } from '../client';

export class GeminiAgent implements ResearchAgent {
    name = 'gemini';
    private client: GeminiClient | null = null;

    constructor(private browserClient: PerplexityClient) {}

    private async ensureClient() {
        if (!this.client) {
            // Ensure browser is init
            if (!this.browserClient.isBrowserInitialized()) {
                await this.browserClient.init();
            }
            this.client = await this.browserClient.createGeminiClient();
            await this.client.init();
        }
        return this.client;
    }

    async query(prompt: string, options?: QueryOptions): Promise<Result> {
        const client = await this.ensureClient();

        let content: string | null;

        if (options?.gem) {
            content = await client.researchWithGem(options.gem, prompt);
        } else {
            content = await client.research(prompt, {
                deepResearch: options?.deepResearch
            });
        }

        // Try to parse research to get citations if possible
        let citations: Citation[] = [];
        try {
            // Only parse if we got content, otherwise it might be failed
            if (content) {
                const parsed = await client.parseResearch();
                if (parsed && parsed.citations) {
                    citations = parsed.citations.map(c => ({
                        id: c.id,
                        text: c.text,
                        url: c.url,
                        domain: c.domain
                    }));
                }
            }
        } catch (e) {
            // console.warn('Failed to parse citations:', e);
        }

        return {
            id: client.getCurrentSessionId() || 'unknown',
            content: content || '',
            citations,
            metadata: {
                gem: options?.gem,
                deepResearch: options?.deepResearch
            }
        };
    }

    async getSession(id: string): Promise<Session> {
        const client = await this.ensureClient();
        // Since we can't easily get single session metadata without listing or opening
        // We will try listing a few.
        const sessions = await client.listSessions(20);
        const s = sessions.find(s => s.id === id);
        if (s) {
            return { id: s.id!, name: s.name };
        }
        // If not found in recent, return basic info
        return { id, name: 'Unknown Session' };
    }

    async listSessions(limit?: number): Promise<Session[]> {
        const client = await this.ensureClient();
        const sessions = await client.listSessions(limit || 20);
        return sessions.map(s => ({
            id: s.id || 'unknown',
            name: s.name
        }));
    }

    async isAvailable(): Promise<boolean> {
        try {
            await this.ensureClient();
            return true;
        } catch (e) {
            return false;
        }
    }
}
