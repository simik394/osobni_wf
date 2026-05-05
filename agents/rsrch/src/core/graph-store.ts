import logger from '../services/logger';
import { 
    GraphJob, 
    Entity, 
    Relationship, 
    PendingAudioStatus, 
    PendingAudio, 
    Turn, 
    Session, 
    Conversation, 
    Audio, 
    Document, 
    Citation 
} from './types/graph-store';

import { GraphConnection, CircuitBreakerState } from './graph-store/connection';
import { JobQueue } from './graph-store/job-queue';
import { KnowledgeBase } from './graph-store/knowledge';
import { ConversationManager } from './graph-store/conversation';
import { CitationManager } from './graph-store/citation';
import { ResearchManager } from './graph-store/research';

export * from './types/graph-store';
export { CircuitBreakerState };

/**
 * GraphStore Facade
 * 
 * This class provides a unified interface to the modular graph store implementation.
 * It maintains backward compatibility with the legacy monolith while delegating
 * actual work to specialized modules.
 */
export class GraphStore {
    private connection: GraphConnection;
    private jobQueue: JobQueue;
    private knowledge: KnowledgeBase;
    private conversation: ConversationManager;
    private citations: CitationManager;
    private research: ResearchManager;

    constructor(graphName = 'rsrch') {
        this.connection = new GraphConnection(graphName);
        this.jobQueue = new JobQueue(this.connection);
        this.knowledge = new KnowledgeBase(this.connection);
        this.conversation = new ConversationManager(this.connection);
        this.citations = new CitationManager(this.connection);
        this.research = new ResearchManager(this.connection);
    }

    // --- Lifecycle ---

    async connect(host = 'localhost', port = 6379, maxRetries = 3, retryDelay = 2000): Promise<void> {
        return this.connection.connect(host, port, maxRetries, retryDelay);
    }

    async disconnect(): Promise<void> {
        return this.connection.disconnect();
    }

    public getIsConnected(): boolean {
        return this.connection.getIsConnected();
    }

    // --- Job Queue ---

    async addJob(type: GraphJob['type'], query: string, options?: Record<string, any>): Promise<GraphJob> {
        return this.jobQueue.addJob(type, query, options);
    }

    async getJob(id: string): Promise<GraphJob | null> {
        return this.jobQueue.getJob(id);
    }

    async listJobs(status?: GraphJob['status'], limit = 50): Promise<GraphJob[]> {
        return this.jobQueue.listJobs(status, limit);
    }

    async updateJobStatus(id: string, status: GraphJob['status'], extra?: Partial<GraphJob>): Promise<void> {
        return this.jobQueue.updateJobStatus(id, status, extra);
    }

    async getNextQueuedJob(): Promise<GraphJob | null> {
        return this.jobQueue.getNextQueuedJob();
    }

    // --- Pending Audio ---

    async createPendingAudio(notebookTitle: string, sources: string[], options?: { windmillJobId?: string; customPrompt?: string }): Promise<PendingAudio> {
        return this.jobQueue.createPendingAudio(notebookTitle, sources, options);
    }

    async updatePendingAudioStatus(id: string, status: PendingAudioStatus, extra?: { error?: string; resultAudioId?: string; windmillJobId?: string }): Promise<void> {
        return this.jobQueue.updatePendingAudioStatus(id, status, extra);
    }

    async getPendingAudio(id: string): Promise<PendingAudio | null> {
        return this.jobQueue.getPendingAudio(id);
    }

    async getPendingAudioByWindmillJobId(windmillJobId: string): Promise<PendingAudio | null> {
        return this.jobQueue.getPendingAudioByWindmillJobId(windmillJobId);
    }

    async listPendingAudios(status?: PendingAudioStatus): Promise<PendingAudio[]> {
        return this.jobQueue.listPendingAudios(status);
    }

    // --- Knowledge Base ---

    async addEntity(entity: Entity): Promise<void> {
        return this.knowledge.addEntity(entity);
    }

    async addRelationship(rel: Relationship): Promise<void> {
        return this.knowledge.addRelationship(rel);
    }

    async findEntities(type: string, limit = 100): Promise<Entity[]> {
        return this.knowledge.findEntities(type, limit);
    }

    async findRelated(entityId: string, relationshipType?: string): Promise<Entity[]> {
        return this.knowledge.findRelated(entityId, relationshipType);
    }

    // --- Agent Memory & Conversation ---

    async storeFact(agentId: string, fact: string, context?: Record<string, any>): Promise<void> {
        return this.conversation.storeFact(agentId, fact, context);
    }

    async getFacts(agentId: string, limit = 50): Promise<string[]> {
        return this.conversation.getFacts(agentId, limit);
    }

    async startConversation(agentId: string): Promise<Conversation> {
        return this.conversation.startConversation(agentId);
    }

    async addTurn(conversationId: string, role: Turn['role'], content: string): Promise<void> {
        return this.conversation.addTurn(conversationId, role, content);
    }

    async getConversation(conversationId: string): Promise<Turn[]> {
        return this.conversation.getConversation(conversationId);
    }

    async getRecentConversations(agentId: string, limit = 10): Promise<Conversation[]> {
        return this.conversation.getRecentConversations(agentId, limit);
    }

    async getConversationWithFilters(id: string, filters: any): Promise<any> {
        return this.conversation.getConversationWithFilters(id, filters);
    }

    async getConversationsByPlatform(platform: string, limit = 50): Promise<any[]> {
        return this.conversation.getConversationsByPlatform(platform, limit);
    }

    async getChangedConversations(since: number): Promise<any[]> {
        return this.conversation.getChangedConversations(since);
    }

    async updateLastExportedAt(id: string, timestamp: number): Promise<void> {
        return this.conversation.updateLastExportedAt(id, timestamp);
    }

    // --- Citations ---

    async mergeCitation(url: string, text: string, domain?: string): Promise<string> {
        return this.citations.mergeCitation(url, text, domain);
    }

    async mergeCitationsBatch(citations: Array<{ url: string; text?: string; domain?: string }>): Promise<void> {
        return this.citations.mergeCitationsBatch(citations);
    }

    async linkCitationsToTurn(turnId: string, urls: string[]): Promise<void> {
        return this.citations.linkCitationsToTurn(turnId, urls);
    }

    async getCitations(options?: { domain?: string; limit?: number }): Promise<Citation[]> {
        return this.citations.getCitations(options);
    }

    async getCitationUsage(url: string): Promise<Array<{ type: 'ResearchDoc' | 'Turn'; id: string; title?: string }>> {
        return this.citations.getCitationUsage(url);
    }

    async migrateCitations(): Promise<{ processed: number, citations: number }> {
        return this.citations.migrateCitations();
    }

    // --- Research Orchestration ---

    async createOrUpdateSession(session: Partial<Session>): Promise<void> {
        return this.research.createOrUpdateSession(session);
    }

    async syncNotebook(data: { platformId: string; title: string; url?: string }): Promise<{ isNew: boolean, id: string }> {
        return this.research.syncNotebook(data);
    }

    async saveDocument(doc: Document): Promise<void> {
        return this.research.saveDocument(doc);
    }

    async saveAudio(audio: Audio): Promise<void> {
        return this.research.saveAudio(audio);
    }

    async linkJobToSession(jobId: string, sessionId: string): Promise<void> {
        return this.research.linkJobToSession(jobId, sessionId);
    }

    async linkSessionToDocument(sessionId: string, documentId: string): Promise<void> {
        return this.research.linkSessionToDocument(sessionId, documentId);
    }

    async linkDocumentToAudio(documentId: string, audioId: string): Promise<void> {
        return this.research.linkDocumentToAudio(documentId, audioId);
    }

    async getLineage(nodeId: string): Promise<any[]> {
        return this.research.getLineage(nodeId);
    }

    async getLineageChain(artifactId: string): Promise<any> {
        return this.research.getLineageChain(artifactId);
    }

    async getNotebooks(limit = 50): Promise<any[]> {
        return this.research.getNotebooks(limit);
    }

    async getSourcesWithoutAudio(platformId: string): Promise<any[]> {
        return this.research.getSourcesWithoutAudio(platformId);
    }

    async getAudioForResearchDoc(docId: string): Promise<Audio | null> {
        return this.research.getAudioForResearchDoc(docId);
    }

    async createResearchAudio(data: any): Promise<string> {
        return this.research.createResearchAudio(data);
    }

    async createWorkflowExecution(execution: any): Promise<void> {
        return this.research.createWorkflowExecution(execution);
    }

    async updateWorkflowExecution(execution: any): Promise<void> {
        return this.research.updateWorkflowExecution(execution);
    }

    async updateStepExecution(executionId: string, step: any): Promise<void> {
        return this.research.updateStepExecution(executionId, step);
    }

    /**
     * High-level helper for Gemini Turns (Session + Turn + Citations)
     */
    async addGeminiTurn(data: {
        sessionId: string;
        role: 'user' | 'assistant';
        content: string;
        citations?: Array<{ url: string; title: string }>;
        thoughts?: string;
    }): Promise<void> {
        const turnId = `gt_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
        
        // This is a bit of a hybrid, we still use direct query for the link to Session
        // OR we could expose a method in ConversationManager that takes a session filter.
        // For now, let's just use the connection's query.
        await this.connection.query(`
            MATCH (s:Session { platformId: $sessionId, platform: 'gemini' })
            CREATE (t:Turn {
                id: $turnId,
                role: $role,
                content: $content,
                thoughts: $thoughts,
                createdAt: $now
            })
            CREATE (s)-[:HAS_TURN]->(t)
        `, {
            params: {
                sessionId: data.sessionId,
                role: data.role,
                content: data.content,
                thoughts: data.thoughts || '',
                turnId,
                now: Date.now()
            }
        });

        if (data.citations && data.citations.length > 0) {
            await this.citations.mergeCitationsBatch(data.citations.map(c => ({ url: c.url, text: c.title })));
            const urls = data.citations.map(c => c.url);
            await this.citations.linkCitationsToTurn(turnId, urls);
        }
    }
}

// Singleton instance management
let instance: GraphStore | null = null;

export function getGraphStore(): GraphStore {
    if (!instance) {
        instance = new GraphStore();
    }
    return instance;
}
