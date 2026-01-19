import { ResearchAgent, QueryOptions, Result, Session, Citation } from '../interfaces/research-agent';
import { PerplexityClient } from '../client';

export class PerplexityAgent implements ResearchAgent {
    name = 'perplexity';

    constructor(private client: PerplexityClient) {}

    private async ensureClient() {
        if (!this.client.isBrowserInitialized()) {
            await this.client.init();
        }
        return this.client;
    }

    async query(prompt: string, options?: QueryOptions): Promise<Result> {
        const client = await this.ensureClient();

        const response = await client.query(prompt, {
            deepResearch: options?.deepResearch
        });

        const citations: Citation[] = (response.sources || []).map(s => {
            let domain = '';
            try {
                domain = new URL(s.url).hostname;
            } catch (e) {
                domain = s.url;
            }
            return {
                id: s.index,
                text: s.title,
                url: s.url,
                domain
            };
        });

        return {
            id: 'latest',
            content: response.answer,
            citations,
            metadata: {
                url: response.url,
                timestamp: response.timestamp
            }
        };
    }

    async getSession(id: string): Promise<Session> {
        // Not supported by underlying client public API
        return { id, name: 'Perplexity Session' };
    }

    async listSessions(limit?: number): Promise<Session[]> {
        // Not supported by underlying client public API
        return [];
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
