import { ResearchAgent } from '../interfaces/research-agent';
import { GeminiAgent } from './gemini-agent';
import { PerplexityAgent } from './perplexity-agent';
import { NotebookLMAgent } from './notebooklm-agent';
import { PerplexityClient } from '../client';

// Singleton browser manager
let browserClient: PerplexityClient | null = null;

function getBrowserClient(): PerplexityClient {
    if (!browserClient) {
        // We initialize with defaults. The clients will call init() which uses config.
        browserClient = new PerplexityClient();
    }
    return browserClient;
}

// Allow injecting client for testing
export function setBrowserClient(client: PerplexityClient) {
    browserClient = client;
}

export function createAgent(type: 'gemini' | 'perplexity' | 'notebooklm'): ResearchAgent {
    const client = getBrowserClient();
    switch (type) {
        case 'gemini':
            return new GeminiAgent(client);
        case 'perplexity':
            return new PerplexityAgent(client);
        case 'notebooklm':
            return new NotebookLMAgent(client);
        default:
            throw new Error(`Unknown agent type: ${type}`);
    }
}

export function getAllAgents(): ResearchAgent[] {
    const client = getBrowserClient();
    return [
        new GeminiAgent(client),
        new PerplexityAgent(client),
        new NotebookLMAgent(client)
    ];
}

export async function closeAgents() {
    if (browserClient) {
        await browserClient.close();
        browserClient = null;
    }
}
