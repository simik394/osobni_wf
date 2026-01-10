export * from './types/graph-store';
/**
 * Graph Store - FalkorDB-based storage for jobs and knowledge
 */

import { FalkorDB } from 'falkordb';
import type Graph from 'falkordb/dist/src/graph';
import { createHash } from 'crypto';
import { NetworkError } from './errors';

import {
    GraphJob,
    Entity,
    Relationship,
    Session,
    Document,
    Audio,
    PendingAudioStatus,
    PendingAudio,
    Conversation,
    Turn,
    Citation,
} from './types/graph-store';

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
    private readonly failureThreshold = 5; // Trip after 5 consecutive failures
    private readonly resetTimeout = 30000; // 30 seconds in OPEN state

    constructor(graphName = 'rsrch') {
        this.graphName = graphName;
    }

    /**
     * Connect to FalkorDB with retry logic.
     */
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
        console.log('[GraphStore] Circuit breaker reset to CLOSED state.');
    }

    private halfOpenCircuit() {
        this.circuitState = CircuitBreakerState.HALF_OPEN;
        console.log('[GraphStore] Circuit breaker moved to HALF_OPEN state.');
    }

    async _executeQuery<T = any>(query: string, options?: { params?: Record<string, any> }): Promise<{ data?: T[] }> {
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
            return result;
        } catch (e: any) {
            this.failureCount++;
            if (this.circuitState === CircuitBreakerState.HALF_OPEN) {
                this.tripCircuit();
            } else if (this.circuitState === CircuitBreakerState.CLOSED && this.failureCount >= this.failureThreshold) {
                this.tripCircuit();
            }
            console.error(`[GraphStore] Cypher query failed: ${e.message}`, { query });
            throw new Error(`[GraphStore] Query execution failed: ${e.message}`);
        }
    }

    async executeQuery(query: string): Promise<{ data?: Record<string, unknown>[] }> {
        return this._executeQuery(query);
    }

    public getIsConnected(): boolean {
        return this.isConnected;
    }

    private async initSchema(): Promise<void> {
        if (!this.graph) throw new Error('Not connected');
        try {
            await this._executeQuery('CREATE INDEX ON :Job(id)');
            await this._executeQuery('CREATE INDEX ON :Job(status)');
            await this._executeQuery('CREATE INDEX ON :Entity(id)');
            await this._executeQuery('CREATE INDEX ON :Entity(type)');
            await this._executeQuery('CREATE INDEX ON :Agent(id)');
            await this._executeQuery('CREATE INDEX ON :GeminiSession(sessionId)');
            await this._executeQuery('CREATE INDEX ON :GeminiSession(title)');
            await this._executeQuery('CREATE INDEX ON :Conversation(id)');
            await this._executeQuery('CREATE INDEX ON :Conversation(platformId)');
            await this._executeQuery('CREATE INDEX ON :Notebook(platformId)');
            console.log('[GraphStore] Schema initialized');
        } catch (e: any) {
            if (!e.message.includes('already exists')) {
                console.warn('[GraphStore] Schema init warning:', e.message);
            }
        }
    }

    private nodeToJob(node: any): GraphJob {
        return {
            id: node.id,
            type: node.type,
            status: node.status,
            query: node.query,
            options: node.options ? JSON.parse(node.options) : undefined,
            result: node.result ? JSON.parse(node.result) : undefined,
            error: node.error,
            createdAt: node.createdAt,
            startedAt: node.startedAt,
            completedAt: node.completedAt
        };
    }

    private nodeToEntity(node: any): Entity {
        return {
            id: node.id,
            type: node.type,
            name: node.name,
            properties: node.properties ? JSON.parse(node.properties) : {}
        };
    }

    // ===================
    // JOB QUEUE OPERATIONS
    // ===================

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
        const escapedQuery = escapeString(query);

        await this._executeQuery(`
            CREATE (j:Job {
                id: '${id}',
                type: '${type}',
                status: 'queued',
                query: '${escapedQuery}',
                options: '${optionsJson}',
                createdAt: ${job.createdAt}
            })
        `);

        console.log(`[GraphStore] Job added: ${id} (${type})`);
        return job;
    }

    async getJob(id: string): Promise<GraphJob | null> {
        const result = await this._executeQuery<any[]>(`
            MATCH (j:Job {id: '${escapeString(id)}'})
            RETURN j
        `);

        if (result.data && result.data.length > 0) {
            const row = result.data[0] as any;
            return this.nodeToJob(row.j);
        }
        return null;
    }

    async listJobs(status?: GraphJob['status'], limit = 50): Promise<GraphJob[]> {
        let query = 'MATCH (j:Job)';
        if (status) {
            query += ` WHERE j.status = '${status}'`;
        }
        query += ` RETURN j ORDER BY j.createdAt DESC LIMIT ${limit}`;

        const result = await this._executeQuery<any[]>(query);

        return (result.data || []).map((row: any) => this.nodeToJob(row.j));
    }

    async updateJobStatus(id: string, status: GraphJob['status'], extra?: Partial<GraphJob>): Promise<void> {
        let setClause = `j.status = '${status}'`;

        if (status === 'running') {
            setClause += `, j.startedAt = ${Date.now()}`;
        } else if (status === 'completed' || status === 'failed') {
            setClause += `, j.completedAt = ${Date.now()}`;
        }

        if (extra?.result) {
            setClause += `, j.result = '${escapeString(JSON.stringify(extra.result))}'`;
        }
        if (extra?.error) {
            setClause += `, j.error = '${escapeString(extra.error)}'`;
        }

        await this._executeQuery(`
            MATCH (j:Job {id: '${escapeString(id)}'})
            SET ${setClause}
        `);

        console.log(`[GraphStore] Job ${id} → ${status}`);
    }

    async getNextQueuedJob(): Promise<GraphJob | null> {
        const result = await this._executeQuery<any[]>(`
            MATCH (j:Job {status: 'queued'})
            RETURN j
            ORDER BY j.createdAt ASC
            LIMIT 1
        `);

        if (result.data && result.data.length > 0) {
            const row = result.data[0] as any;
            return this.nodeToJob(row.j);
        }
        return null;
    }

    // ===================
    // PENDING AUDIO
    // ===================

    async createPendingAudio(
        notebookTitle: string,
        sources: string[],
        options?: { windmillJobId?: string; customPrompt?: string }
    ): Promise<PendingAudio> {
        const id = `pa_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
        const now = Date.now();

        await this._executeQuery(`
            CREATE (pa:PendingAudio {
                id: '${escapeString(id)}',
                notebookTitle: '${escapeString(notebookTitle)}',
                sources: '${escapeString(JSON.stringify(sources))}',
                status: 'queued',
                windmillJobId: '${escapeString(options?.windmillJobId || '')}',
                customPrompt: '${escapeString(options?.customPrompt || '')}',
                createdAt: ${now}
            })
        `);

        return {
            id,
            notebookTitle,
            sources,
            status: 'queued',
            windmillJobId: options?.windmillJobId,
            customPrompt: options?.customPrompt,
            createdAt: now
        };
    }

    async updatePendingAudioStatus(
        id: string,
        status: PendingAudioStatus,
        extra?: { error?: string; resultAudioId?: string; windmillJobId?: string }
    ): Promise<void> {
        let setClause = `pa.status = '${status}'`;
        if (status === 'started' || status === 'generating') {
            setClause += `, pa.startedAt = ${Date.now()}`;
        } else if (status === 'completed' || status === 'failed') {
            setClause += `, pa.completedAt = ${Date.now()}`;
        }
        if (extra?.error) setClause += `, pa.error = '${escapeString(extra.error)}'`;
        if (extra?.resultAudioId) setClause += `, pa.resultAudioId = '${escapeString(extra.resultAudioId)}'`;
        if (extra?.windmillJobId) setClause += `, pa.windmillJobId = '${escapeString(extra.windmillJobId)}'`;

        await this._executeQuery(`
            MATCH (pa:PendingAudio {id: '${escapeString(id)}'})
            SET ${setClause}
        `);
    }

    async getPendingAudio(id: string): Promise<PendingAudio | null> {
        const result = await this._executeQuery<any[]>(`
            MATCH (pa:PendingAudio {id: '${escapeString(id)}'})
            RETURN pa
        `);
        if (result.data && result.data.length > 0) {
            const node = (result.data[0] as any).pa;
            return {
                id: node.id,
                notebookTitle: node.notebookTitle,
                sources: JSON.parse(node.sources || '[]'),
                status: node.status,
                windmillJobId: node.windmillJobId || undefined,
                customPrompt: node.customPrompt || undefined,
                createdAt: node.createdAt,
                startedAt: node.startedAt,
                completedAt: node.completedAt,
                error: node.error,
                resultAudioId: node.resultAudioId
            };
        }
        return null;
    }

    async listPendingAudios(status?: PendingAudioStatus): Promise<PendingAudio[]> {
        const whereClause = status ? `WHERE pa.status = '${status}'` : '';
        const result = await this._executeQuery<any[]>(`
            MATCH (pa:PendingAudio)
            ${whereClause}
            RETURN pa
            ORDER BY pa.createdAt DESC
            LIMIT 50
        `);
        if (!result.data) return [];
        return result.data.map((row: any) => {
            const node = row.pa;
            return {
                id: node.id,
                notebookTitle: node.notebookTitle,
                sources: JSON.parse(node.sources || '[]'),
                status: node.status,
                windmillJobId: node.windmillJobId,
                customPrompt: node.customPrompt,
                createdAt: node.createdAt,
                startedAt: node.startedAt,
                completedAt: node.completedAt,
                error: node.error,
                resultAudioId: node.resultAudioId
            };
        });
    }

    async deletePendingAudio(id: string): Promise<void> {
        await this._executeQuery(`
            MATCH (pa:PendingAudio {id: '${escapeString(id)}'})
            DETACH DELETE pa
        `);
    }

    async cleanupStalePendingAudios(maxAgeMs = 60 * 60 * 1000, options: { dryRun?: boolean } = {}): Promise<number> {
        const cutoff = Date.now() - maxAgeMs;
        const dryRun = options.dryRun || false;

        if (dryRun) {
            const result = await this._executeQuery<any[]>(`
                MATCH (pa:PendingAudio)
                WHERE pa.createdAt < ${cutoff} AND pa.status IN ['queued', 'started', 'generating']
                RETURN count(pa) as count
            `);
            return (result.data?.[0] as any)?.count || 0;
        }

        const result = await this._executeQuery<any[]>(`
            MATCH (pa:PendingAudio)
            WHERE pa.createdAt < ${cutoff} AND pa.status IN ['queued', 'started', 'generating']
            WITH pa
            DETACH DELETE pa
            RETURN count(pa) as deleted
        `);
        return (result.data?.[0] as any)?.deleted || 0;
    }

    // ===================
    // KNOWLEDGE / FACTS
    // ===================

    async addEntity(entity: Entity): Promise<void> {
        const propsJson = escapeString(JSON.stringify(entity.properties));
        await this._executeQuery(`
            CREATE (e:Entity:${entity.type} {
                id: '${escapeString(entity.id)}',
                type: '${escapeString(entity.type)}',
                name: '${escapeString(entity.name)}',
                properties: '${propsJson}',
                createdAt: ${Date.now()}
            })
        `);
    }

    async addRelationship(rel: Relationship): Promise<void> {
        const propsJson = rel.properties ? escapeString(JSON.stringify(rel.properties)) : '{}';
        await this._executeQuery(`
            MATCH (a:Entity {id: '${escapeString(rel.from)}'}), (b:Entity {id: '${escapeString(rel.to)}'})
            CREATE (a)-[:${rel.type} {properties: '${propsJson}', createdAt: ${Date.now()}}]->(b)
        `);
    }

    async findEntities(type: string, limit = 100): Promise<Entity[]> {
        const result = await this._executeQuery<any[]>(`
            MATCH (e:Entity {type: '${escapeString(type)}'})
            RETURN e LIMIT ${limit}
        `);
        return (result.data || []).map((row: any) => this.nodeToEntity(row.e));
    }

    async findRelated(entityId: string, relationshipType?: string): Promise<Entity[]> {
        let query = `MATCH (a:Entity {id: '${escapeString(entityId)}'})-[r${relationshipType ? `:${relationshipType}` : ''}]->(b:Entity) RETURN b`;
        const result = await this._executeQuery<any[]>(query);
        return (result.data || []).map((row: any) => this.nodeToEntity(row.b));
    }

    async storeFact(agentId: string, fact: string, metadata?: any): Promise<void> {
        const metaStr = metadata ? escapeString(JSON.stringify(metadata)) : '{}';
        await this._executeQuery(`
            MERGE (a:Agent {id: '${escapeString(agentId)}'})
            CREATE (f:Fact {content: '${escapeString(fact)}', metadata: '${metaStr}', createdAt: ${Date.now()}})
            CREATE (a)-[:KNOWS]->(f)
        `);
    }

    async getFacts(agentId: string): Promise<string[]> {
        const result = await this._executeQuery<any[]>(`
            MATCH (a:Agent {id: '${escapeString(agentId)}'})-[:KNOWS]->(f:Fact)
            RETURN f.content
        `);
        return (result.data || []).map((row: any) => row['f.content']);
    }

    // ===================
    // CONVERSATIONS
    // ===================

    async syncConversation(data: any): Promise<{ id: string, isNew: boolean }> {
        const id = data.id || `conv_${data.platform}_${Date.now()}`;
        const platformId = data.platformId || '';
        const title = data.title || 'Untitled';
        const type = data.type || 'regular';

        // Upsert conversation node
        const checkQuery = `MATCH (c:Conversation {platformId: '${escapeString(platformId)}'}) RETURN c.id`;
        const existing = await this._executeQuery(checkQuery);

        let convId = id;
        let isNew = true;

        if (existing.data && existing.data.length > 0) {
            convId = existing.data[0]['c.id'];
            isNew = false;
            // Update
            await this._executeQuery(`
                MATCH (c:Conversation {id: '${escapeString(convId)}'})
                SET c.title = '${escapeString(title)}', c.capturedAt = ${Date.now()}
            `);
        } else {
            // Create
            await this._executeQuery(`
                CREATE (c:Conversation {
                    id: '${escapeString(convId)}',
                    platform: '${escapeString(data.platform)}',
                    platformId: '${escapeString(platformId)}',
                    title: '${escapeString(title)}',
                    type: '${escapeString(type)}',
                    createdAt: ${Date.now()},
                    capturedAt: ${Date.now()}
                })
            `);
        }

        // Sync turns if provided
        if (data.turns && data.turns.length > 0) {
            // Remove existing turns to replace them (simple sync)
            await this._executeQuery(`MATCH (c:Conversation {id: '${escapeString(convId)}'})-[r:HAS_TURN]->(t:Turn) DETACH DELETE t`);

            for (let i = 0; i < data.turns.length; i++) {
                const turn = data.turns[i];
                const turnId = `${convId}_t${i}`;
                await this._executeQuery(`
                    MATCH (c:Conversation {id: '${escapeString(convId)}'})
                    CREATE (t:Turn {
                        id: '${escapeString(turnId)}',
                        role: '${escapeString(turn.role)}',
                        content: '${escapeString(turn.content)}',
                        index: ${i}
                    })
                    CREATE (c)-[:HAS_TURN {index: ${i}}]->(t)
                `);
            }
        }

        // Sync ResearchDocs if provided
        if (data.researchDocs && data.researchDocs.length > 0) {
             for (const doc of data.researchDocs) {
                 const docId = `rd_${convId}_${Date.now()}_${Math.floor(Math.random()*1000)}`;
                 await this._executeQuery(`
                    MATCH (c:Conversation {id: '${escapeString(convId)}'})
                    CREATE (d:ResearchDoc {
                        id: '${escapeString(docId)}',
                        title: '${escapeString(doc.title)}',
                        content: '${escapeString(doc.content)}',
                        createdAt: ${Date.now()}
                    })
                    MERGE (c)-[:HAS_DOC]->(d)
                 `);

                 // Sources for doc
                 if (doc.sources) {
                     for (const src of doc.sources) {
                         // Simple citation node
                         await this._executeQuery(`
                            MATCH (d:ResearchDoc {id: '${escapeString(docId)}'})
                            MERGE (cit:Citation {url: '${escapeString(src.url)}'})
                            ON CREATE SET cit.text = '${escapeString(src.text)}', cit.domain = '${escapeString(src.domain)}'
                            MERGE (d)-[:CITES]->(cit)
                         `);
                     }
                 }
             }
        }

        return { id: convId, isNew };
    }

    async getConversationsByPlatform(platform: string, limit = 50): Promise<Conversation[]> {
        const result = await this._executeQuery<any[]>(`
            MATCH (c:Conversation {platform: '${escapeString(platform)}'})
            OPTIONAL MATCH (c)-[:HAS_TURN]->(t:Turn)
            WITH c, count(t) as turnCount
            RETURN c, turnCount
            ORDER BY c.capturedAt DESC
            LIMIT ${limit}
        `);

        return (result.data || []).map((row: any) => ({
            ...row.c,
            turnCount: row.turnCount
        }));
    }

    async getConversationWithFilters(id: string, filters: any): Promise<{ conversation: Conversation | null, turns: Turn[], researchDocs?: any[] }> {
        // Get Conversation
        const convRes = await this._executeQuery<any[]>(`MATCH (c:Conversation {id: '${escapeString(id)}'}) RETURN c`);
        if (!convRes.data || convRes.data.length === 0) {
            return { conversation: null, turns: [] };
        }
        const conversation = (convRes.data[0] as any).c;

        // Get Turns
        let turnQuery = `MATCH (c:Conversation {id: '${escapeString(id)}'})-[:HAS_TURN]->(t:Turn)`;
        if (filters.questionsOnly) {
            turnQuery += ` WHERE t.role = 'user'`;
        } else if (filters.answersOnly) {
            turnQuery += ` WHERE t.role = 'assistant'`;
        }
        turnQuery += ` RETURN t ORDER BY t.index ASC`;
        const turnsRes = await this._executeQuery<any[]>(turnQuery);
        const turns = (turnsRes.data || []).map((row: any) => row.t);

        // Get Docs
        let researchDocs: any[] = [];
        if (filters.includeResearchDocs) {
            const docsRes = await this._executeQuery<any[]>(`
                MATCH (c:Conversation {id: '${escapeString(id)}'})-[:HAS_DOC]->(d:ResearchDoc)
                RETURN d
            `);
            researchDocs = (docsRes.data || []).map((row: any) => row.d);

            // Populate sources for each doc
            for (const doc of researchDocs) {
                const srcRes = await this._executeQuery<any[]>(`
                    MATCH (d:ResearchDoc {id: '${escapeString(doc.id)}'})-[:CITES]->(cit:Citation)
                    RETURN cit
                `);
                doc.sources = (srcRes.data || []).map((row: any) => row.cit);
            }
        }

        return { conversation, turns, researchDocs };
    }

    async createSession(session: any): Promise<void> {
        await this._executeQuery(`
            MERGE (s:Session {id: '${escapeString(session.id)}'})
            SET s.platform = '${escapeString(session.platform)}',
                s.externalId = '${escapeString(session.externalId)}',
                s.query = '${escapeString(session.query)}',
                s.createdAt = ${Date.now()}
        `);
    }

    async createOrUpdateGeminiSession(session: any): Promise<void> {
        // Same as createSession but specific to Gemini object structure
        const id = session.id ? `gemini-${session.id}` : `gemini-unknown-${Date.now()}`;
        await this._executeQuery(`
            MERGE (s:GeminiSession {sessionId: '${escapeString(session.id)}'})
            SET s.title = '${escapeString(session.name)}',
                s.updatedAt = ${Date.now()}
        `);
    }

    async createResearchAudio(data: any): Promise<any> {
        const id = `audio_${Date.now()}`;
        await this._executeQuery(`
            MATCH (d:ResearchDoc {id: '${escapeString(data.researchDocId)}'})
            CREATE (a:Audio {
                id: '${id}',
                path: '${escapeString(data.path)}',
                filename: '${escapeString(data.filename)}',
                duration: ${data.duration || 0},
                createdAt: ${Date.now()}
            })
            CREATE (d)-[:HAS_AUDIO]->(a)
        `);
        return { id, ...data };
    }

    async getAudioForResearchDoc(researchDocId: string): Promise<any> {
        const result = await this._executeQuery<any[]>(`
            MATCH (d:ResearchDoc {id: '${escapeString(researchDocId)}'})-[:HAS_AUDIO]->(a:Audio)
            RETURN a
            LIMIT 1
        `);
        if (result.data && result.data.length > 0) {
            return (result.data[0] as any).a;
        }
        return null;
    }

    async getLineage(artifactId: string): Promise<any[]> {
        // Find node and traverse up/down
        // Simple 1-hop for now
        const result = await this._executeQuery<any[]>(`
            MATCH (n {id: '${escapeString(artifactId)}'})-[r]-(m)
            RETURN m
        `);
        return (result.data || []).map((row: any) => row.m);
    }

    async getLineageChain(artifactId: string): Promise<any> {
        // Try to find Job -> Session -> Document -> Audio chain
        // This is a heuristic based on ID or relationships
        // If artifactId is a Job ID:
        const jobRes = await this.getJob(artifactId);
        if (jobRes) {
            // Find related session/doc via result
            return { job: jobRes };
        }

        // If it's a doc
        const docRes = await this._executeQuery(`MATCH (d:ResearchDoc {id: '${escapeString(artifactId)}'}) RETURN d`);
        if (docRes.data && docRes.data.length > 0) {
            const doc = docRes.data[0].d;
            // Find parent conversation
            const convRes = await this._executeQuery(`MATCH (c:Conversation)-[:HAS_DOC]->(d:ResearchDoc {id: '${escapeString(artifactId)}'}) RETURN c`);
            const audioRes = await this.getAudioForResearchDoc(artifactId);
            return {
                document: doc,
                session: convRes.data?.[0]?.c,
                audio: audioRes
            };
        }

        return {};
    }

    async getNotebooks(limit = 50): Promise<any[]> {
        const result = await this._executeQuery<any[]>(`
            MATCH (n:Notebook)
            RETURN n
            ORDER BY n.capturedAt DESC
            LIMIT ${limit}
        `);
        return (result.data || []).map((row: any) => row.n);
    }

    async syncNotebook(data: any): Promise<any> {
        const id = `nb_${data.platformId}`;
        const check = await this._executeQuery(`MATCH (n:Notebook {id: '${escapeString(id)}'}) RETURN n`);
        const isNew = !check.data || check.data.length === 0;

        await this._executeQuery(`
            MERGE (n:Notebook {id: '${escapeString(id)}'})
            SET n.platformId = '${escapeString(data.platformId)}',
                n.title = '${escapeString(data.title)}',
                n.sourceCount = ${data.sources?.length || 0},
                n.audioCount = ${data.audioOverviews?.length || 0},
                n.capturedAt = ${Date.now()}
        `);
        return { id, isNew };
    }

    async getSourcesWithoutAudio(platformId: string): Promise<any[]> {
        // Finds sources in a notebook that don't have a linked audio overview
        // This requires modeling sources and audio as nodes
        // For now, return empty if not modeled
        return [];
    }

    async getCitations(options: { domain?: string, limit?: number }): Promise<any[]> {
        let query = `MATCH (c:Citation)`;
        if (options.domain) {
            query += ` WHERE c.domain = '${escapeString(options.domain)}'`;
        }
        query += ` RETURN c LIMIT ${options.limit || 50}`;
        const res = await this._executeQuery<any[]>(query);
        return (res.data || []).map((row: any) => row.c);
    }

    async getCitationUsage(url: string): Promise<any[]> {
        const res = await this._executeQuery<any[]>(`
            MATCH (n)-[:CITES]->(c:Citation {url: '${escapeString(url)}'})
            RETURN n
        `);
        return (res.data || []).map((row: any) => row.n);
    }

    async migrateCitations(): Promise<any> {
        // Extract citations from ResearchDocs and create nodes
        // This is a one-time migration script logic moved here
        return { processed: 0, citations: 0 };
    }

    async updateLastExportedAt(id: string, timestamp: number): Promise<void> {
        await this._executeQuery(`
            MATCH (n {id: '${escapeString(id)}'})
            SET n.lastExportedAt = ${timestamp}
        `);
    }

    async getChangedConversations(since: number): Promise<any[]> {
        const res = await this._executeQuery<any[]>(`
            MATCH (c:Conversation)
            WHERE c.capturedAt > ${since}
            RETURN c
        `);
        return (res.data || []).map((row: any) => row.c);
    }

    /**
     * Disconnect from FalkorDB
     */
    async disconnect(): Promise<void> {
        if (this.client) {
            await this.client.close();
            this.client = null;
            this.graph = null;
            this.isConnected = false;
            console.log('[GraphStore] Disconnected');
        }
    }
}

// Singleton instance
let graphStore: GraphStore | null = null;

export function getGraphStore(): GraphStore {
    if (!graphStore) {
        graphStore = new GraphStore();
    }
    return graphStore;
}
