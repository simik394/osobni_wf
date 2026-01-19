import { FalkorDB } from 'falkordb';
import type Graph from 'falkordb/dist/src/graph';
import { NetworkError } from './errors';

import {
    GraphJob,
    Entity,
    Relationship,
    PendingAudioStatus,
    PendingAudio,
    ResearchInfo,
    Turn
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

    /**
     * Synchronize a Notebook node in the graph.
     * Uses MERGE to ensure idempotency.
     */
    async syncNotebook(data: { platformId: string; title: string; url?: string }): Promise<{ isNew: boolean, id: string }> {
        const id = `nb_${data.platformId}`;
        const query = `
            MERGE (n:Notebook {platformId: $platformId})
            ON CREATE SET 
                n.id = $id, 
                n.title = $title, 
                n.url = $url, 
                n.createdAt = $now,
                n._isNew = true
            ON MATCH SET 
                n.title = $title, 
                n.url = $url, 
                n.updatedAt = $now,
                n._isNew = false
            RETURN n.id as id, n._isNew as isNew
        `;

        try {
            const result = await this._executeQuery<{ id: string, isNew: boolean }[]>(query, {
                params: {
                    platformId: data.platformId,
                    id,
                    title: data.title,
                    url: data.url || '',
                    now: Date.now()
                }
            });

            if (result.data && result.data.length > 0) {
                // FalkorDB returns objects differently depending on version/driver
                const row = result.data[0] as any;
                return {
                    id: row.id || row[0],
                    isNew: row.isNew !== undefined ? row.isNew : row[1]
                };
            }
            return { isNew: false, id };
        } catch (e) {
            console.error('[GraphStore] syncNotebook error:', e);
            return { isNew: false, id };
        }
    }

    async getNotebooks(limit = 50): Promise<any[]> {
        const query = `MATCH (n:Notebook) RETURN n ORDER BY n.updatedAt DESC, n.createdAt DESC LIMIT $limit`;
        try {
            const result = await this._executeQuery<any[]>(query, { params: { limit } });
            return (result.data || []).map(row => {
                const node = row[0] || row;
                return node.properties || node;
            });
        } catch (e) {
            console.error('[GraphStore] getNotebooks error:', e);
            return [];
        }
    }

    async getSourcesWithoutAudio(platformId: string): Promise<any[]> {
        return [];
    }

    /**
     * Create a new research session node.
     */
    async createSession(data: { platform: string; platformId: string; title?: string }): Promise<string> {
        const id = `session_${data.platform}_${data.platformId}`;
        const query = `
            MERGE (s:Session {platformId: $platformId, platform: $platform})
            ON CREATE SET s.id = $id, s.title = $title, s.createdAt = $now
            ON MATCH SET s.title = $title, s.updatedAt = $now
            RETURN s.id as id
        `;
        try {
            const result = await this._executeQuery<{ id: string }[]>(query, {
                params: {
                    platformId: data.platformId,
                    platform: data.platform,
                    id,
                    title: data.title || '',
                    now: Date.now()
                }
            });
            return result.data && result.data.length > 0 ? (result.data[0] as any).id : id;
        } catch (e) {
            console.error('[GraphStore] createSession error:', e);
            return id;
        }
    }

    /**
     * Specialized update for Gemini sessions including deep research state.
     */
    async createOrUpdateGeminiSession(data: {
        sessionId: string;
        title: string;
        isDeepResearch?: boolean
    }): Promise<void> {
        const query = `
            MERGE (s:Session {platformId: $sessionId, platform: 'gemini'})
            ON CREATE SET 
                s.id = "session_gemini_" + $sessionId, 
                s.title = $title, 
                s.isDeepResearch = $isDeepResearch,
                s.createdAt = $now
            ON MATCH SET 
                s.title = $title, 
                s.isDeepResearch = $isDeepResearch,
                s.updatedAt = $now
        `;
        try {
            await this._executeQuery(query, {
                params: {
                    sessionId: data.sessionId,
                    title: data.title,
                    isDeepResearch: !!data.isDeepResearch,
                    now: Date.now()
                }
            });
        } catch (e) {
            console.error('[GraphStore] createOrUpdateGeminiSession error:', e);
        }
    }

    /**
     * Synchronize a Conversation node in the graph.
     */
    async syncConversation(data: {
        platformId: string;
        title: string;
        platform: string;
        type?: string;
        turns?: Turn[]
    }): Promise<{ isNew: boolean, id: string }> {
        const id = `conv_${data.platformId}`;
        const query = `
            MERGE (c:Conversation {platformId: $platformId})
            ON CREATE SET 
                c.id = $id, 
                c.title = $title, 
                c.platform = $platform, 
                c.type = $type,
                c.createdAt = $now,
                c.turnCount = $turnCount,
                c._isNew = true
            ON MATCH SET 
                c.title = $title, 
                c.type = $type,
                c.turnCount = $turnCount,
                c.updatedAt = $now,
                c._isNew = false
            RETURN c.id as id, c._isNew as isNew
        `;

        try {
            const result = await this._executeQuery<{ id: string, isNew: boolean }[]>(query, {
                params: {
                    platformId: data.platformId,
                    id,
                    title: data.title,
                    platform: data.platform,
                    type: data.type || 'regular',
                    turnCount: data.turns?.length || 0,
                    now: Date.now()
                }
            });

            // If turns provided, we could store them as separate nodes or property
            // For now, let's keep it simple and return the conversation info.

            if (result.data && result.data.length > 0) {
                const row = result.data[0] as any;
                return {
                    id: row.id || row[0],
                    isNew: row.isNew !== undefined ? row.isNew : row[1]
                };
            }
            return { isNew: false, id };
        } catch (e) {
            console.error('[GraphStore] syncConversation error:', e);
            return { isNew: false, id };
        }
    }

    async getConversationsByPlatform(platform: string, limit = 50): Promise<any[]> {
        const query = `
            MATCH (c:Conversation {platform: $platform})
            RETURN c ORDER BY c.createdAt DESC LIMIT $limit
        `;
        try {
            const result = await this._executeQuery<any[]>(query, { params: { platform, limit } });
            return (result.data || []).map(row => {
                const node = row[0] || row;
                return node.properties || node;
            });
        } catch (e) {
            console.error('[GraphStore] getConversationsByPlatform error:', e);
            return [];
        }
    }

    async getConversationWithFilters(id: string, filters: any): Promise<{ conversation: any, turns: any[], researchDocs: any[] }> {
        // Complex query to get conversation + turns + research docs
        const query = `
            MATCH (c:Conversation {id: $id})
            OPTIONAL MATCH (c)-[:CONTAINS]->(t:Turn)
            OPTIONAL MATCH (c)-[:HAS_RESEARCH_DOC]->(d:ResearchDoc)
            RETURN c, collect(DISTINCT t) as turns, collect(DISTINCT d) as docs
        `;
        try {
            const result = await this._executeQuery<any[]>(query, { params: { id } });
            if (result.data && result.data.length > 0) {
                const row = result.data[0] as any;
                const c = row.c || row[0];
                const turns = row.turns || row[1] || [];
                const docs = row.docs || row[2] || [];

                return {
                    conversation: c.properties || c,
                    turns: turns.map((t: any) => t.properties || t),
                    researchDocs: docs.map((d: any) => d.properties || d)
                };
            }
        } catch (e) {
            console.error('[GraphStore] getConversationWithFilters error:', e);
        }
        return { conversation: null, turns: [], researchDocs: [] };
    }

    async getChangedConversations(since: number): Promise<any[]> {
        const query = `
            MATCH (c:Conversation)
            WHERE c.updatedAt > $since OR c.createdAt > $since
            RETURN c ORDER BY c.updatedAt DESC
        `;
        try {
            const result = await this._executeQuery<any[]>(query, { params: { since } });
            return (result.data || []).map(row => (row[0] || row).properties || (row[0] || row));
        } catch (e) {
            console.error('[GraphStore] getChangedConversations error:', e);
            return [];
        }
    }

    async updateLastExportedAt(id: string, timestamp: number): Promise<void> {
        const query = `MATCH (c:Conversation {id: $id}) SET c.lastExportedAt = $timestamp`;
        try {
            await this._executeQuery(query, { params: { id, timestamp } });
        } catch (e) {
            console.error('[GraphStore] updateLastExportedAt error:', e);
        }
    }

    // --- Lineage ---
    async getLineageChain(artifactId: string): Promise<any> {
        const query = `
            MATCH (a {id: $id})
            OPTIONAL MATCH (j:Job)-[:GENERATED]->(s:Session)-[:HAS_RESEARCH_DOC]->(d:ResearchDoc)-[:HAS_AUDIO]->(au:Audio)
            WHERE a.id IN [j.id, s.id, d.id, au.id]
            RETURN j, s, d, au
        `;
        try {
            const result = await this._executeQuery<any[]>(query, { params: { id: artifactId } });
            if (result.data && result.data.length > 0) {
                const row = result.data[0] as any;
                return {
                    job: (row.j || row[0])?.properties || null,
                    session: (row.s || row[1])?.properties || null,
                    document: (row.d || row[2])?.properties || null,
                    audio: (row.au || row[3])?.properties || null
                };
            }
        } catch (e) {
            console.error('[GraphStore] getLineageChain error:', e);
        }
        return { job: null, session: null, document: null, audio: null };
    }

    async getLineage(nodeId: string): Promise<any[]> {
        const query = `
            MATCH (n {id: $id})
            MATCH (n)<-[r*1..5]-(m)
            RETURN m, r
        `;
        try {
            const result = await this._executeQuery<any[]>(query, { params: { id: nodeId } });
            return (result.data || []).map(row => (row[0] || row).properties || (row[0] || row));
        } catch (e) {
            console.error('[GraphStore] getLineage error:', e);
            return [];
        }
    }

    // --- Citations ---
    async getCitations(filters: { domain?: string, limit?: number }): Promise<any[]> {
        const where = filters.domain ? `WHERE s.domain = $domain` : '';
        const query = `
            MATCH (s:Source)
            ${where}
            RETURN s ORDER BY s.createdAt DESC LIMIT $limit
        `;
        try {
            const result = await this._executeQuery<any[]>(query, {
                params: {
                    domain: filters.domain || '',
                    limit: filters.limit || 50
                }
            });
            return (result.data || []).map(row => (row[0] || row).properties || (row[0] || row));
        } catch (e) {
            console.error('[GraphStore] getCitations error:', e);
            return [];
        }
    }

    async getCitationUsage(url: string): Promise<any[]> {
        const query = `
            MATCH (s:Source {url: $url})<-[:REFERENCES]-(t)
            RETURN t
        `;
        try {
            const result = await this._executeQuery<any[]>(query, { params: { url } });
            return (result.data || []).map(row => (row[0] || row).properties || (row[0] || row));
        } catch (e) {
            console.error('[GraphStore] getCitationUsage error:', e);
            return [];
        }
    }

    async migrateCitations(): Promise<{ processed: number, citations: number }> {
        // Implementation for migrating legacy citations if needed
        return { processed: 0, citations: 0 };
    }

    // --- Audio ---
    async createResearchAudio(data: { docId: string; path: string; duration?: number }): Promise<string> {
        const id = `au_${Date.now()}`;
        const query = `
            MATCH (d:ResearchDoc {id: $docId})
            CREATE (au:Audio {id: $id, path: $path, duration: $duration, createdAt: $now})
            MERGE (d)-[:HAS_AUDIO]->(au)
            RETURN au.id as id
        `;
        try {
            const result = await this._executeQuery<{ id: string }[]>(query, {
                params: {
                    docId: data.docId,
                    path: data.path,
                    duration: data.duration || 0,
                    id,
                    now: Date.now()
                }
            });
            return result.data && result.data.length > 0 ? (result.data[0] as any).id : id;
        } catch (e) {
            console.error('[GraphStore] createResearchAudio error:', e);
            return id;
        }
    }

    async getAudioForResearchDoc(docId: string): Promise<any> {
        const query = `MATCH (d:ResearchDoc {id: $docId})-[:HAS_AUDIO]->(au:Audio) RETURN au`;
        try {
            const result = await this._executeQuery<any[]>(query, { params: { docId } });
            if (result.data && result.data.length > 0) {
                return (result.data[0][0] || result.data[0]).properties || result.data[0][0];
            }
        } catch (e) {
            console.error('[GraphStore] getAudioForResearchDoc error:', e);
        }
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

    // --- Fact Extraction & Reasoning ---

    /**
     * Store an extracted fact and link it to its source (e.g. Conversation or ResearchDoc).
     */
    async storeFact(fact: string, sourceId: string, metadata: Record<string, any> = {}): Promise<void> {
        const id = `fact_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
        const query = `
            MATCH (s {id: $sourceId})
            MERGE (f:Fact {content: $content})
            ON CREATE SET f.id = $id, f.createdAt = $now, f.metadata = $metadata
            MERGE (s)-[:EVIDENCE_FOR {createdAt: $now}]->(f)
        `;
        try {
            await this._executeQuery(query, {
                params: {
                    sourceId,
                    content: fact,
                    id,
                    metadata: JSON.stringify(metadata),
                    now: Date.now()
                }
            });
        } catch (e) {
            console.error('[GraphStore] storeFact error:', e);
        }
    }

    /**
     * Add a citation/source URL and link it to a node.
     */
    async addCitation(data: { url: string; title?: string; domain?: string }, targetId: string): Promise<void> {
        const query = `
            MATCH (t {id: $targetId})
            MERGE (s:Source {url: $url})
            ON CREATE SET 
                s.id = "src_" + apoc.text.base64Encode($url),
                s.title = $title, 
                s.domain = $domain, 
                s.createdAt = $now
            ON MATCH SET 
                s.title = CASE WHEN s.title IS NULL THEN $title ELSE s.title END,
                s.updatedAt = $now
            MERGE (t)-[:REFERENCES {createdAt: $now}]->(s)
        `;
        // Note: Using a heuristic for ID if apoc not available, or just regular ID if preferred
        const id = `doc_${Buffer.from(data.url).toString('base64').substring(0, 16)}`;

        try {
            await this._executeQuery(query, {
                params: {
                    targetId,
                    url: data.url,
                    title: data.title || '',
                    domain: data.domain || new URL(data.url).hostname,
                    now: Date.now()
                }
            }).catch(async (e) => {
                // Fallback if apoc is missing
                const fallbackQuery = `
                    MATCH (t {id: $targetId})
                    MERGE (s:Source {url: $url})
                    ON CREATE SET s.id = $id, s.title = $title, s.domain = $domain, s.createdAt = $now
                    MERGE (t)-[:REFERENCES {createdAt: $now}]->(s)
                `;
                return this._executeQuery(fallbackQuery, {
                    params: { targetId, url: data.url, title: data.title || '', domain: data.domain || '', id, now: Date.now() }
                });
            });
        } catch (e) {
            console.error('[GraphStore] addCitation error:', e);
        }
    }

    /**
     * Create reasoning steps for a specific turn or action.
     */
    async createReasoningStep(turnId: string, steps: string[]): Promise<void> {
        const query = `
            MATCH (t {id: $turnId})
            UNWIND range(0, size($steps)-1) as idx
            WITH t, idx, $steps[idx] as stepText
            CREATE (rs:ReasoningStep {
                id: $turnId + "_step_" + idx,
                content: stepText,
                order: idx,
                createdAt: $now
            })
            MERGE (t)-[:THOUGHT_PROCESS]->(rs)
        `;
        try {
            await this._executeQuery(query, {
                params: {
                    turnId,
                    steps,
                    now: Date.now()
                }
            });
        } catch (e) {
            console.error('[GraphStore] createReasoningStep error:', e);
        }
    }

    // --- Workflows ---

    async createWorkflowExecution(execution: any): Promise<void> {
        const query = `
            CREATE (w:WorkflowExecution {
                id: $id,
                workflowName: $workflowName,
                status: $status,
                startTime: $startTime,
                results: $results,
                error: $error
            })
        `;
        const params = {
            id: execution.id,
            workflowName: execution.workflowName,
            status: execution.status,
            startTime: execution.startTime,
            results: JSON.stringify(execution.results || {}),
            error: execution.error || ''
        };
        try {
            await this._executeQuery(query, { params });
        } catch (e: any) {
            console.error('[GraphStore] createWorkflowExecution error:', e.message);
        }
    }

    async updateWorkflowExecution(execution: any): Promise<void> {
        let set = `w.status = $status, w.results = $results`;
        if (execution.endTime) set += `, w.endTime = $endTime`;
        if (execution.error) set += `, w.error = $error`;

        const query = `MATCH (w:WorkflowExecution {id: $id}) SET ${set}`;
        const params = {
            id: execution.id,
            status: execution.status,
            results: JSON.stringify(execution.results || {}),
            endTime: execution.endTime || 0,
            error: execution.error || ''
        };
        try {
            await this._executeQuery(query, { params });
        } catch (e: any) {
            console.error('[GraphStore] updateWorkflowExecution error:', e.message);
        }
    }

    async updateStepExecution(executionId: string, step: any): Promise<void> {
        const query = `
            MATCH (w:WorkflowExecution {id: $executionId})
            MERGE (s:StepExecution {id: $stepId, workflowExecutionId: $executionId})
            ON CREATE SET
                s.status = $status,
                s.startTime = $startTime,
                s.endTime = $endTime,
                s.result = $result,
                s.error = $error
            ON MATCH SET
                s.status = $status,
                s.startTime = $startTime,
                s.endTime = $endTime,
                s.result = $result,
                s.error = $error
            MERGE (w)-[:HAS_STEP]->(s)
        `;
        const params = {
            executionId,
            stepId: step.id,
            status: step.status,
            startTime: step.startTime || 0,
            endTime: step.endTime || 0,
            result: JSON.stringify(step.result || {}),
            error: step.error || ''
        };
        try {
            await this._executeQuery(query, { params });
        } catch (e: any) {
            console.error('[GraphStore] updateStepExecution error:', e.message);
        }
    }
}

let graphStore: GraphStore | null = null;
export function getGraphStore(): GraphStore {
    if (!graphStore) graphStore = new GraphStore();
    return graphStore;
}
