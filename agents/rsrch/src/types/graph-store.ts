
/**
 * Represents a raw node returned from a FalkorDB query.
 * FalkorDB queries can return nodes with properties directly on the object,
 * or nested within a `properties` object. This interface accounts for both.
 */
export interface FalkorDBNode {
    properties?: Record<string, unknown>;
    [key: string]: unknown;
}

export interface GraphJob {
    id: string;
    type: 'query' | 'deepResearch' | 'audio-generation' | 'research-to-podcast' | 'syncConversations';
    status: 'queued' | 'running' | 'completed' | 'failed';
    query: string;
    options?: Record<string, unknown>;
    result?: unknown;
    error?: string;
    createdAt: number;
    startedAt?: number;
    completedAt?: number;
}

export interface Entity {
    id: string;
    type: string;
    name: string;
    properties: Record<string, unknown>;
}

export interface Relationship {
    from: string;
    to: string;
    type: string;
    properties?: Record<string, unknown>;
}

// Lineage node types
export interface Session {
    id: string;
    platform: 'gemini' | 'perplexity' | 'notebooklm';
    externalId: string;
    query: string;
    createdAt: number;
}

export interface Document {
    id: string;
    title: string;
    url?: string;
    createdAt: number;
}

export interface Audio {
    id: string;
    path: string;
    duration?: number;
    createdAt: number;
}

// PendingAudio tracks audio generation state in real-time
export type PendingAudioStatus = 'queued' | 'started' | 'generating' | 'completed' | 'failed';

export interface PendingAudio {
    id: string;
    notebookTitle: string;
    sources: string[];
    status: PendingAudioStatus;
    windmillJobId?: string;
    customPrompt?: string;
    createdAt: number;
    startedAt?: number;
    completedAt?: number;
    error?: string;
    resultAudioId?: string;
}

export interface Conversation {
    id: string;
    agentId: string;
    platform?: 'gemini' | 'perplexity' | 'notebooklm';
    platformId?: string;
    title?: string;
    type?: 'regular' | 'deep-research';
    capturedAt?: number;
    createdAt: number;
    turnCount?: number;
}

export interface Turn {
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: number;
}

export interface Citation {
    id: string;
    url: string;
    domain: string;
    text: string;
    firstSeenAt: number;
}

export interface ResearchInfo {
    title: string | null;        // Session title (short name)
    firstHeading: string | null; // First heading in the document
    sessionId: string | null;
}

export interface GeminiSession {
    sessionId: string;
    title: string;
    createdAt: number;
    lastQueryAt: number;
}

export interface GeminiQuery {
    queryId: string;
    sessionId: string;
    query: string;
    createdAt: number;
}

export interface GeminiSession {
    sessionId: string;
    title: string;
    createdAt: number;
    lastQueryAt: number;
}

export interface GeminiQuery {
    queryId: string;
    sessionId: string;
    query: string;
    createdAt: number;
}
