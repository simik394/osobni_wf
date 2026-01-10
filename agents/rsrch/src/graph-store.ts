import { FalkorDB } from 'falkordb';
import type Graph from 'falkordb/dist/src/graph';
import { NetworkError } from './errors';

import {
    GraphJob,
    Entity,
    Relationship,
    PendingAudioStatus,
    PendingAudio,
    ResearchInfo
} from './types/graph-store';

export * from './types/graph-store';

// Helper to escape strings for Cypher queries
function escapeString(str: string): string {
    if (typeof str !== 'string') return '';
    return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"');
}

enum CircuitBreakerState {
    CLOSED = 'CLOSED',
    OPEN = 'OPEN',
    HALF_OPEN = 'HALF_OPEN',
}

export class GraphStore {
    private client: FalkorDB | null = null;
    private graph: Graph | null = null;
    private graphName: string;
    private isConnected = false;

    // Circuit Breaker properties
    private circuitState: CircuitBreakerState = CircuitBreakerState.CLOSED;
    private failureCount = 0;
    private lastFailure = 0;
    private readonly failureThreshold = 5;
    private readonly resetTimeout = 30000;

    constructor(graphName = 'rsrch') {
        this.graphName = graphName;
    }

    async connect(host = 'localhost', port = 6379, maxRetries = 3, retryDelay = 2000): Promise<void> {
        if (this.isConnected) return;
        for (let i = 0; i < maxRetries; i++) {
            try {
                this.client = await FalkorDB.connect({ socket: { host, port } });
                this.graph = this.client.selectGraph(this.graphName);
                this.isConnected = true;
                this.resetCircuit();
                console.log(`[GraphStore] Connected to FalkorDB at ${host}:${port}, graph: ${this.graphName}`);
                await this.initSchema();
                return;
            } catch (e: any) {
                console.error(`[GraphStore] Connection attempt ${i + 1}/${maxRetries} failed:`, e.message);
                if (i < maxRetries - 1) {
                    await new Promise(resolve => setTimeout(resolve, retryDelay * (i + 1)));
                } else {
                    this.tripCircuit();
                    throw new NetworkError(`[GraphStore] Connection failed after ${maxRetries} attempts: ${e.message}`);
                }
            }
        }
    }

    private tripCircuit() {
        this.circuitState = CircuitBreakerState.OPEN;
        this.lastFailure = Date.now();
        this.failureCount = 0;
        console.error('[GraphStore] Circuit breaker tripped to OPEN state.');
    }

    private resetCircuit() {
        this.circuitState = CircuitBreakerState.CLOSED;
        this.failureCount = 0;
    }

    private halfOpenCircuit() {
        this.circuitState = CircuitBreakerState.HALF_OPEN;
    }

    private async _executeQuery<T = any[]>(query: string, options?: { params?: Record<string, any> }): Promise<{ data?: T }> {
        if (this.circuitState === CircuitBreakerState.OPEN) {
            if (Date.now() - this.lastFailure > this.resetTimeout) {
                this.halfOpenCircuit();
            } else {
                throw new NetworkError('GraphStore circuit breaker is open. Queries are temporarily blocked.');
            }
        }

        if (!this.graph) throw new NetworkError('Not connected to GraphStore');

        try {
            const result = await this.graph.query<T>(query, options);
            if (this.circuitState === CircuitBreakerState.HALF_OPEN) {
                this.resetCircuit();
            }
            this.failureCount = 0;
            return { data: result.data as unknown as T }; // Force cast to match T
        } catch (e: any) {
            this.failureCount++;
            if (this.circuitState === CircuitBreakerState.HALF_OPEN) {
                this.tripCircuit();
            } else if (this.circuitState === CircuitBreakerState.CLOSED && this.failureCount >= this.failureThreshold) {
                this.tripCircuit();
            }
            throw new Error(`[GraphStore] Query execution failed: ${e.message}`);
        }
    }

    async executeQuery(query: string): Promise<{ data?: Record<string, unknown>[] }> {
        return this._executeQuery(query);
    }

    public getIsConnected(): boolean {
        return this.isConnected;
    }

    async disconnect(): Promise<void> {
        if (this.client) {
            await this.client.close();
            this.client = null;
            this.graph = null;
            this.isConnected = false;
        }
    }

    private async initSchema(): Promise<void> {
        if (!this.graph) return;
        try {
            await this._executeQuery('CREATE INDEX ON :Job(id)');
            await this._executeQuery('CREATE INDEX ON :Job(status)');
        } catch (e) { /* ignore */ }
    }

    // --- Helpers ---
    private nodeToJob(node: any): GraphJob {
        const props = node.properties || {};
        return {
            id: props.id,
            type: props.type,
            status: props.status,
            query: props.query,
            options: props.options ? JSON.parse(props.options) : undefined,
            result: props.result ? JSON.parse(props.result) : undefined,
            error: props.error,
            createdAt: props.createdAt,
            startedAt: props.startedAt,
            completedAt: props.completedAt
        };
    }

    private nodeToEntity(node: any): Entity {
        const props = node.properties || {};
        return {
            id: props.id,
            type: props.type,
            name: props.name,
            properties: props.properties ? JSON.parse(props.properties) : {}
        };
    }

    // --- Jobs ---
    async addJob(type: GraphJob['type'], query: string, options?: Record<string, any>): Promise<GraphJob> {
        const id = Math.random().toString(36).substring(2, 10);
        const job: GraphJob = {
            id,
            type,
            status: 'queued',
            query,
            options,
            createdAt: Date.now()
        };
        const optionsJson = options ? escapeString(JSON.stringify(options)) : '';
        await this._executeQuery(`CREATE (j:Job {id: '${id}', type: '${type}', status: 'queued', query: '${escapeString(query)}', options: '${optionsJson}', createdAt: ${job.createdAt}})`);
        return job;
    }

    async getJob(id: string): Promise<GraphJob | null> {
        const result = await this._executeQuery<any[]>(`MATCH (j:Job {id: '${escapeString(id)}'}) RETURN j`);
        if (result.data && result.data.length > 0) return this.nodeToJob(result.data[0][0]);
        return null;
    }

    async listJobs(status?: GraphJob['status'], limit = 50): Promise<GraphJob[]> {
        const where = status ? `WHERE j.status = '${status}'` : '';
        const result = await this._executeQuery<any[]>(`MATCH (j:Job) ${where} RETURN j ORDER BY j.createdAt DESC LIMIT ${limit}`);
        return (result.data || []).map(row => this.nodeToJob(row[0]));
    }

    async updateJobStatus(id: string, status: GraphJob['status'], extra?: Partial<GraphJob>): Promise<void> {
        let set = `j.status = '${status}'`;
        if (status === 'running') set += `, j.startedAt = ${Date.now()}`;
        if (status === 'completed' || status === 'failed') set += `, j.completedAt = ${Date.now()}`;
        if (extra?.result) set += `, j.result = '${escapeString(JSON.stringify(extra.result))}'`;
        if (extra?.error) set += `, j.error = '${escapeString(extra.error)}'`;
        await this._executeQuery(`MATCH (j:Job {id: '${escapeString(id)}'}) SET ${set}`);
    }

    async getNextQueuedJob(): Promise<GraphJob | null> {
        const result = await this._executeQuery<any[]>(`MATCH (j:Job {status: 'queued'}) RETURN j ORDER BY j.createdAt ASC LIMIT 1`);
        if (result.data && result.data.length > 0) return this.nodeToJob(result.data[0][0]);
        return null;
    }

    // --- Notebooks ---
    async syncNotebook(data: any): Promise<{ isNew: boolean, id: string }> {
        // Stub implementation
        const id = `nb_${data.platformId || Date.now()}`;
        return { isNew: true, id };
    }

    async getNotebooks(limit = 50): Promise<any[]> {
        return [];
    }

    async getSourcesWithoutAudio(platformId: string): Promise<any[]> {
        return [];
    }

    // --- Conversations / Sessions ---
    async createSession(data: any): Promise<string> {
        return `session_${Date.now()}`;
    }

    async createOrUpdateGeminiSession(data: any): Promise<void> {
    }

    async syncConversation(data: any): Promise<{ isNew: boolean, id: string }> {
        return { isNew: true, id: data.id || `conv_${Date.now()}` };
    }

    async getConversationsByPlatform(platform: string, limit = 50): Promise<any[]> {
        return [];
    }

    async getConversationWithFilters(id: string, filters: any): Promise<{ conversation: any, turns: any[], researchDocs: any[] }> {
        return { conversation: null, turns: [], researchDocs: [] };
    }

    async getChangedConversations(since: number): Promise<any[]> {
        return [];
    }

    async updateLastExportedAt(id: string, timestamp: number): Promise<void> {}

    // --- Lineage ---
    async getLineageChain(artifactId: string): Promise<any> {
        return { job: null, session: null, document: null, audio: null };
    }

    async getLineage(nodeId: string): Promise<any[]> {
        return [];
    }

    // --- Citations ---
    async getCitations(filters: { domain?: string, limit?: number }): Promise<any[]> {
        return [];
    }

    async getCitationUsage(url: string): Promise<any[]> {
        return [];
    }

    async migrateCitations(): Promise<{ processed: number, citations: number }> {
        return { processed: 0, citations: 0 };
    }

    // --- Audio ---
    async createResearchAudio(data: any): Promise<string> {
        return `audio_${Date.now()}`;
    }

    async getAudioForResearchDoc(docId: string): Promise<any> {
        return null;
    }

    // --- Pending Audio ---
     async createPendingAudio(
        notebookTitle: string,
        sources: string[],
        options?: { windmillJobId?: string; customPrompt?: string }
    ): Promise<PendingAudio> {
        const id = `pa_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
        const now = Date.now();
        await this._executeQuery(`CREATE (pa:PendingAudio {id: '${escapeString(id)}', notebookTitle: '${escapeString(notebookTitle)}', sources: '${escapeString(JSON.stringify(sources))}', status: 'queued', windmillJobId: '${escapeString(options?.windmillJobId || '')}', customPrompt: '${escapeString(options?.customPrompt || '')}', createdAt: ${now}})`);
        return { id, notebookTitle, sources, status: 'queued', windmillJobId: options?.windmillJobId, customPrompt: options?.customPrompt, createdAt: now };
    }

    async updatePendingAudioStatus(id: string, status: PendingAudioStatus, extra?: { error?: string; resultAudioId?: string; windmillJobId?: string }): Promise<void> {
         let set = `pa.status = '${status}'`;
         if (status === 'started' || status === 'generating') set += `, pa.startedAt = ${Date.now()}`;
         if (status === 'completed' || status === 'failed') set += `, pa.completedAt = ${Date.now()}`;
         if (extra?.error) set += `, pa.error = '${escapeString(extra.error)}'`;
         if (extra?.resultAudioId) set += `, pa.resultAudioId = '${escapeString(extra.resultAudioId)}'`;
         if (extra?.windmillJobId) set += `, pa.windmillJobId = '${escapeString(extra.windmillJobId)}'`;
         await this._executeQuery(`MATCH (pa:PendingAudio {id: '${escapeString(id)}'}) SET ${set}`);
    }

    async getPendingAudio(id: string): Promise<PendingAudio | null> {
        const result = await this._executeQuery<any[]>(`MATCH (pa:PendingAudio {id: '${escapeString(id)}'}) RETURN pa`);
        if (result.data && result.data.length > 0) {
            const props = result.data[0][0].properties;
            return {
                id: props.id,
                notebookTitle: props.notebookTitle,
                sources: JSON.parse(props.sources || '[]'),
                status: props.status,
                windmillJobId: props.windmillJobId,
                customPrompt: props.customPrompt,
                createdAt: props.createdAt,
                startedAt: props.startedAt,
                completedAt: props.completedAt,
                error: props.error,
                resultAudioId: props.resultAudioId
            };
        }
        return null;
    }

    async listPendingAudios(status?: PendingAudioStatus): Promise<PendingAudio[]> {
        const where = status ? `WHERE pa.status = '${status}'` : '';
        const result = await this._executeQuery<any[]>(`MATCH (pa:PendingAudio) ${where} RETURN pa ORDER BY pa.createdAt DESC LIMIT 50`);
        return (result.data || []).map(row => {
            const props = row[0].properties;
            return {
                id: props.id,
                notebookTitle: props.notebookTitle,
                sources: JSON.parse(props.sources || '[]'),
                status: props.status,
                windmillJobId: props.windmillJobId,
                customPrompt: props.customPrompt,
                createdAt: props.createdAt,
                startedAt: props.startedAt,
                completedAt: props.completedAt,
                error: props.error,
                resultAudioId: props.resultAudioId
            };
        });
    }

    async deletePendingAudio(id: string): Promise<void> {
        await this._executeQuery(`MATCH (pa:PendingAudio {id: '${escapeString(id)}'}) DETACH DELETE pa`);
    }

    async cleanupStalePendingAudios(maxAgeMs = 60 * 60 * 1000): Promise<number> {
        return 0;
    }

    // --- Entity ---
    async addEntity(entity: Entity): Promise<void> {
         const propsJson = escapeString(JSON.stringify(entity.properties));
         await this._executeQuery(`CREATE (e:Entity:${entity.type} {id: '${escapeString(entity.id)}', type: '${escapeString(entity.type)}', name: '${escapeString(entity.name)}', properties: '${propsJson}', createdAt: ${Date.now()}})`);
    }

    async addRelationship(rel: Relationship): Promise<void> {
         const propsJson = rel.properties ? escapeString(JSON.stringify(rel.properties)) : '{}';
         await this._executeQuery(`MATCH (a:Entity {id: '${escapeString(rel.from)}'}), (b:Entity {id: '${escapeString(rel.to)}'}) CREATE (a)-[:${rel.type} {properties: '${propsJson}', createdAt: ${Date.now()}}]->(b)`);
    }

    async findEntities(type: string, limit = 100): Promise<Entity[]> {
        const result = await this._executeQuery<any[]>(`MATCH (e:Entity {type: '${escapeString(type)}'}) RETURN e LIMIT ${limit}`);
        return (result.data || []).map(row => this.nodeToEntity(row[0]));
    }

    async findRelated(entityId: string, relationshipType?: string): Promise<Entity[]> {
        let query = `MATCH (a:Entity {id: '${escapeString(entityId)}'})-[r${relationshipType ? `:${relationshipType}` : ''}]->(b:Entity) RETURN b`;
        const result = await this._executeQuery<any[]>(query);
        return (result.data || []).map(row => this.nodeToEntity(row[0]));
    }
}

let graphStore: GraphStore | null = null;
export function getGraphStore(): GraphStore {
    if (!graphStore) graphStore = new GraphStore();
    return graphStore;
}
