import { ResearchAgent, QueryOptions, Result, Session, Citation } from '../interfaces/research-agent';
import { NotebookLMClient } from '../notebooklm-client';
import { PerplexityClient } from '../client';

export class NotebookLMAgent implements ResearchAgent {
    name = 'notebooklm';
    private client: NotebookLMClient | null = null;

    constructor(private browserClient: PerplexityClient) {}

    private async ensureClient() {
        if (!this.client) {
            if (!this.browserClient.isBrowserInitialized()) {
                await this.browserClient.init();
            }
            this.client = await this.browserClient.createNotebookClient();
            await this.client.init();
        }
        return this.client;
    }

    async query(prompt: string, options?: QueryOptions): Promise<Result> {
        const client = await this.ensureClient();

        // Handle sources if provided
        if (options?.sources && options.sources.length > 0) {
            // For now, we assume sources are URLs to add.
            // If we are not in a specific notebook, this might fail or create one?
            // client.query assumes we are in a notebook.
            // If we just init(), we are at home.
            // We should probably create a temporary notebook if sources are provided?
            // Or use a default one.
            // For simplicity, we just log a warning that sources adding is not fully auto-handled here yet.
            // console.warn('Adding sources dynamically not fully implemented in unified query');

            // Try to add sources if they look like URLs
             for (const src of options.sources) {
                 if (src.startsWith('http')) {
                     await client.addSourceUrl(src);
                 }
             }
        }

        const content = await client.query(prompt);

        return {
            id: 'notebooklm-session',
            content,
            citations: [], // Citations not easily extracted from simple query result
            metadata: {}
        };
    }

    async getSession(id: string): Promise<Session> {
        return { id, name: id };
    }

    async listSessions(limit?: number): Promise<Session[]> {
        const client = await this.ensureClient();
        const notebooks = await client.listNotebooks();

        return notebooks.slice(0, limit).map(n => ({
            id: n.platformId || n.title,
            name: n.title,
            metadata: { sourceCount: n.sourceCount }
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
