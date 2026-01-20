import { FalkorDB } from 'falkordb';
import type Graph from 'falkordb/dist/src/graph';
import { createHash } from 'crypto';
import logger from './logger';
import { NetworkError } from './errors';

import {
    GraphJob,
    Entity,
    Relationship,
    PendingAudioStatus,
    PendingAudio,
    ResearchInfo,
    Turn,
    Session,
    Conversation,
    Audio,
    Document,
    Citation
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
                logger.info(`[GraphStore] Connected to FalkorDB at ${host}:${port}, graph: ${this.graphName}`);

                // Initialize schema
                await this.initSchema();
                return;
            } catch (e: any) {
                logger.error(`[GraphStore] Connection attempt ${i + 1}/${maxRetries} failed:`, e.message);
                if (i < maxRetries - 1) {
                    await new Promise(resolve => setTimeout(resolve, retryDelay * (i + 1)));
                } else {
                    this.tripCircuit();
                    throw new NetworkError(`[GraphStore] Connection failed after ${maxRetries} attempts: ${e.message}`);
                }
            }
        }
    }

    /**
     * Execute a raw Cypher query (public for CLI use)
     */
    async executeQuery(query: string): Promise<{ data?: Record<string, unknown>[] }> {
        if (!this.graph) throw new Error('Not connected');
        return this.graph.query(query);
    }

    /**
     * Initialize graph schema (indexes)
     */
    private async initSchema(): Promise<void> {
        if (!this.graph) throw new Error('Not connected');

        try {
            // Create indexes for common lookups
            await this.graph.createNodeRangeIndex('Job', 'id').catch(() => { });
            await this.graph.createNodeRangeIndex('Job', 'status').catch(() => { });
            await this.graph.createNodeRangeIndex('Entity', 'id').catch(() => { });
            await this.graph.createNodeRangeIndex('Entity', 'type').catch(() => { });
            await this.graph.createNodeRangeIndex('Agent', 'id').catch(() => { });
            logger.info('[GraphStore] Schema initialized');
        } catch (e: any) {
            logger.warn('[GraphStore] Schema init warning:', e.message);
        }
    }

    // ===================
    // JOB QUEUE OPERATIONS
    // ===================

    /**
     * Add a job to the queue
     */
    async addJob(type: GraphJob['type'], query: string, options?: Record<string, any>): Promise<GraphJob> {
        if (!this.graph) throw new Error('Not connected');

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

        await this.graph.query(`
            CREATE (j:Job {
                id: '${id}',
                type: '${type}',
                status: 'queued',
                query: '${escapedQuery}',
                options: '${optionsJson}',
                createdAt: ${job.createdAt}
            })
        `);

        logger.info(`[GraphStore] Job added: ${id} (${type})`);
        return job;
    }

    /**
     * Get a job by ID
     */
    async getJob(id: string): Promise<GraphJob | null> {
        if (!this.graph) throw new Error('Not connected');

        const result = await this.graph.query<any[]>(`
            MATCH (j:Job {id: '${escapeString(id)}'})
            RETURN j
        `);

        if (result.data && result.data.length > 0) {
            const row = result.data[0] as any;
            return this.nodeToJob(row.j);
        }
        return null;
    }

    /**
     * List jobs, optionally filtered by status
     */
    async listJobs(status?: GraphJob['status'], limit = 50): Promise<GraphJob[]> {
        if (!this.graph) throw new Error('Not connected');

        let query = 'MATCH (j:Job)';
        if (status) {
            query += ` WHERE j.status = '${status}'`;
        }
        query += ` RETURN j ORDER BY j.createdAt DESC LIMIT ${limit}`;

        const result = await this.graph.query<any[]>(query);

        return (result.data || []).map((row: any) => this.nodeToJob(row.j));
    }

    /**
     * Update job status
     */
    async updateJobStatus(id: string, status: GraphJob['status'], extra?: Partial<GraphJob>): Promise<void> {
        if (!this.graph) throw new Error('Not connected');

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

        await this.graph.query(`
            MATCH (j:Job {id: '${escapeString(id)}'})
            SET ${setClause}
        `);

        logger.info(`[GraphStore] Job ${id} → ${status}`);
    }

    /**
     * Get next queued job (FIFO)
     */
    async getNextQueuedJob(): Promise<GraphJob | null> {
        if (!this.graph) throw new Error('Not connected');

        const result = await this.graph.query<any[]>(`
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

    // ============================================================
    // PendingAudio State Management (Real-time state sync)
    // ============================================================

    /**
     * Create a PendingAudio node when audio generation is queued
     */
    async createPendingAudio(
        notebookTitle: string,
        sources: string[],
        options?: { windmillJobId?: string; customPrompt?: string }
    ): Promise<PendingAudio> {
        if (!this.graph) throw new Error('Not connected');

        const id = `pa_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
        const now = Date.now();

        await this.graph.query(`
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

        logger.info(`[GraphStore] PendingAudio ${id} created (queued)`);

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

    /**
     * Update PendingAudio status
     */
    async updatePendingAudioStatus(
        id: string,
        status: PendingAudioStatus,
        extra?: { error?: string; resultAudioId?: string; windmillJobId?: string }
    ): Promise<void> {
        if (!this.graph) throw new Error('Not connected');

        let setClause = `pa.status = '${status}'`;

        if (status === 'started' || status === 'generating') {
            setClause += `, pa.startedAt = ${Date.now()}`;
        } else if (status === 'completed' || status === 'failed') {
            setClause += `, pa.completedAt = ${Date.now()}`;
        }

        if (extra?.error) {
            setClause += `, pa.error = '${escapeString(extra.error)}'`;
        }
        if (extra?.resultAudioId) {
            setClause += `, pa.resultAudioId = '${escapeString(extra.resultAudioId)}'`;
        }
        if (extra?.windmillJobId) {
            setClause += `, pa.windmillJobId = '${escapeString(extra.windmillJobId)}'`;
        }

        await this.graph.query(`
            MATCH (pa:PendingAudio {id: '${escapeString(id)}'})
            SET ${setClause}
        `);

        logger.info(`[GraphStore] PendingAudio ${id} → ${status}`);
    }

    /**
     * Get a PendingAudio by ID
     */
    async getPendingAudio(id: string): Promise<PendingAudio | null> {
        if (!this.graph) throw new Error('Not connected');

        const result = await this.graph.query<any[]>(`
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

    /**
     * List all pending audios
     */
    async listPendingAudios(status?: PendingAudioStatus): Promise<PendingAudio[]> {
        if (!this.graph) throw new Error('Not connected');

        const whereClause = status ? `WHERE pa.status = '${status}'` : '';
        const result = await this.graph.query<any[]>(`
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
                windmillJobId: node.windmillJobId || undefined,
                customPrompt: node.customPrompt || undefined,
                createdAt: node.createdAt,
                startedAt: node.startedAt,
                completedAt: node.completedAt,
                error: node.error,
                resultAudioId: node.resultAudioId
            };
        });
    }

    /**
     * Delete a PendingAudio
     */
    async deletePendingAudio(id: string): Promise<void> {
        if (!this.graph) throw new Error('Not connected');

        await this.graph.query(`
            MATCH (pa:PendingAudio {id: '${escapeString(id)}'})
            DETACH DELETE pa
        `);

        logger.info(`[GraphStore] PendingAudio ${id} deleted`);
    }

    /**
     * Clean up stale PendingAudios (older than 1 hour)
     */
    async cleanupStalePendingAudios(maxAgeMs = 60 * 60 * 1000): Promise<number> {
        if (!this.graph) throw new Error('Not connected');

        const cutoff = Date.now() - maxAgeMs;
        const result = await this.graph.query<any[]>(`
            MATCH (pa:PendingAudio)
            WHERE pa.createdAt < ${cutoff} AND pa.status IN ['queued', 'started', 'generating']
            WITH pa, pa.id as id
            DETACH DELETE pa
            RETURN count(*) as deleted
        `);

        const deleted = (result.data?.[0] as any)?.deleted || 0;
        if (deleted > 0) {
            logger.info(`[GraphStore] Cleaned up ${deleted} stale PendingAudio nodes`);
        }
        return deleted;
    }

    // =========================
    // KNOWLEDGE BASE OPERATIONS
    // =========================

    /**
     * Add an entity to the knowledge base
     */
    async addEntity(entity: Entity): Promise<void> {
        if (!this.graph) throw new Error('Not connected');

        const propsJson = escapeString(JSON.stringify(entity.properties));
        await this.graph.query(`
            CREATE (e:Entity:${entity.type} {
                id: '${escapeString(entity.id)}',
                type: '${escapeString(entity.type)}',
                name: '${escapeString(entity.name)}',
                properties: '${propsJson}',
                createdAt: ${Date.now()}
            })
        `);

        logger.info(`[GraphStore] Entity added: ${entity.type}:${entity.name}`);
    }

    /**
     * Add a relationship between entities
     */
    async addRelationship(rel: Relationship): Promise<void> {
        if (!this.graph) throw new Error('Not connected');

        const propsJson = rel.properties ? escapeString(JSON.stringify(rel.properties)) : '{}';
        await this.graph.query(`
            MATCH (a:Entity {id: '${escapeString(rel.from)}'}), (b:Entity {id: '${escapeString(rel.to)}'})
            CREATE (a)-[:${rel.type} {properties: '${propsJson}', createdAt: ${Date.now()}}]->(b)
        `);

        logger.info(`[GraphStore] Relationship added: ${rel.from} -[${rel.type}]-> ${rel.to}`);
    }

    /**
     * Find entities by type
     */
    async findEntities(type: string, limit = 100): Promise<Entity[]> {
        if (!this.graph) throw new Error('Not connected');

        const result = await this.graph.query<any[]>(`
            MATCH (e:Entity {type: '${escapeString(type)}'})
            RETURN e
            LIMIT ${limit}
        `);

        return (result.data || []).map((row: any) => this.nodeToEntity(row.e));
    }

    /**
     * Find related entities
     */
    async findRelated(entityId: string, relationshipType?: string): Promise<Entity[]> {
        if (!this.graph) throw new Error('Not connected');

        let query = `MATCH (a:Entity {id: '${escapeString(entityId)}'})-[r]->(b:Entity)`;
        if (relationshipType) {
            query = `MATCH (a:Entity {id: '${escapeString(entityId)}'})-[r:${relationshipType}]->(b:Entity)`;
        }
        query += ' RETURN b';

        const result = await this.graph.query<any[]>(query);
        return (result.data || []).map((row: any) => this.nodeToEntity(row.b));
    }

    // ====================
    // AGENT MEMORY
    // ====================

    /**
     * Store a fact for an agent
     */
    async storeFact(agentId: string, fact: string, context?: Record<string, any>): Promise<void> {
        if (!this.graph) throw new Error('Not connected');

        const factId = Math.random().toString(36).substring(2, 12);
        const contextJson = context ? escapeString(JSON.stringify(context)) : '{}';

        await this.graph.query(`
            MERGE (a:Agent {id: '${escapeString(agentId)}'})
            CREATE (f:Fact {
                id: '${factId}',
                content: '${escapeString(fact)}',
                context: '${contextJson}',
                createdAt: ${Date.now()}
            })
            CREATE (a)-[:KNOWS]->(f)
        `);
    }

    /**
     * Retrieve facts for an agent
     */
    async getFacts(agentId: string, limit = 50): Promise<string[]> {
        if (!this.graph) throw new Error('Not connected');

        const result = await this.graph.query<any[]>(`
            MATCH (a:Agent {id: '${escapeString(agentId)}'})-[:KNOWS]->(f:Fact)
            RETURN f.content
            ORDER BY f.createdAt DESC
            LIMIT ${limit}
        `);

        return (result.data || []).map((row: any) => row['f.content']);
    }

    // ====================
    // CONVERSATION HISTORY
    // ====================

    /**
     * Start a new conversation for an agent
     */
    async startConversation(agentId: string): Promise<Conversation> {
        if (!this.graph) throw new Error('Not connected');

        const id = Math.random().toString(36).substring(2, 12);
        const createdAt = Date.now();

        await this.graph.query(`
            MERGE (a:Agent {id: '${escapeString(agentId)}'})
            CREATE (c:Conversation {
                id: '${id}',
                agentId: '${escapeString(agentId)}',
                createdAt: ${createdAt}
            })
            CREATE (a)-[:HAD]->(c)
        `);

        logger.info(`[GraphStore] Conversation started: ${id} for agent ${agentId}`);
        return { id, agentId, createdAt };
    }

    /**
     * Add a turn to a conversation
     */
    async addTurn(conversationId: string, role: Turn['role'], content: string): Promise<void> {
        if (!this.graph) throw new Error('Not connected');

        const timestamp = Date.now();

        // Create turn and link to conversation
        await this.graph.query(`
            MATCH (c:Conversation {id: '${escapeString(conversationId)}'})
            CREATE (t:Turn {
                role: '${role}',
                content: '${escapeString(content)}',
                timestamp: ${timestamp}
            })
            CREATE (c)-[:HAS_TURN]->(t)
        `);

        // Link to previous turn if exists
        await this.graph.query(`
            MATCH (c:Conversation {id: '${escapeString(conversationId)}'})-[:HAS_TURN]->(prev:Turn)
            WHERE NOT (prev)-[:NEXT]->(:Turn)
            WITH prev ORDER BY prev.timestamp DESC LIMIT 1
            MATCH (c)-[:HAS_TURN]->(curr:Turn)
            WHERE curr.timestamp = ${timestamp}
            CREATE (prev)-[:NEXT]->(curr)
        `).catch(() => { }); // Ignore if no previous turn
    }

    /**
     * Get conversation history
     */
    async getConversation(conversationId: string): Promise<Turn[]> {
        if (!this.graph) throw new Error('Not connected');

        const result = await this.graph.query<any[]>(`
            MATCH (c:Conversation {id: '${escapeString(conversationId)}'})-[:HAS_TURN]->(t:Turn)
            RETURN t
            ORDER BY t.timestamp ASC
        `);

        return (result.data || []).map((row: any) => {
            const props = row.t.properties || row.t;
            return {
                role: props.role,
                content: props.content,
                timestamp: props.timestamp
            };
        });
    }

    /**
     * Get recent conversations for an agent
     */
    async getRecentConversations(agentId: string, limit = 10): Promise<Conversation[]> {
        if (!this.graph) throw new Error('Not connected');

        const result = await this.graph.query<any[]>(`
            MATCH (a:Agent {id: '${escapeString(agentId)}'})-[:HAD]->(c:Conversation)
            RETURN c
            ORDER BY c.createdAt DESC
            LIMIT ${limit}
        `);

        return (result.data || []).map((row: any) => {
            const props = row.c.properties || row.c;
            return {
                id: props.id,
                agentId: props.agentId,
                createdAt: props.createdAt
            };
        });
    }

    // ====================
    // PLATFORM CONVERSATION SCRAPING
    // ====================

    /**
     * Sync a scraped conversation from a platform (upsert by platformId)
     * Smart merge: compares turn count and updates if different
     */
    async syncConversation(data: {
        platform: 'gemini' | 'perplexity';
        platformId: string;
        title: string;
        type: 'regular' | 'deep-research';
        turns: Array<{ role: 'user' | 'assistant'; content: string; timestamp?: number }>;
        researchDocs?: Array<{
            title: string;
            content: string;
            sources?: Array<{ id: number; text: string; url: string; domain: string }>;
            reasoningSteps?: Array<{ phase: string; action: string }>;
        }>;
    }): Promise<{ id: string; isNew: boolean; turnsUpdated?: boolean }> {
        if (!this.graph) throw new Error('Not connected');

        const capturedAt = Date.now();
        const id = `conv_${data.platform}_${data.platformId}`;

        // Check if conversation already exists and get turn count
        const existing = await this.graph.query<any[]>(`
            MATCH (c:Conversation {platformId: '${escapeString(data.platformId)}', platform: '${data.platform}'})
            OPTIONAL MATCH (c)-[:HAS_TURN]->(t:Turn)
            RETURN c.id as id, count(t) as turnCount
        `);

        const isNew = !existing.data || existing.data.length === 0;
        const existingTurnCount = isNew ? 0 : ((existing.data as any[])[0]?.turnCount ?? 0);
        const newTurnCount = data.turns.length;

        if (isNew) {
            // Create new conversation
            await this.graph.query(`
                MERGE (a:Agent {id: '${data.platform}'})
                CREATE (c:Conversation {
                    id: '${id}',
                    platformId: '${escapeString(data.platformId)}',
                    platform: '${data.platform}',
                    title: '${escapeString(data.title)}',
                    type: '${data.type}',
                    createdAt: ${capturedAt},
                    capturedAt: ${capturedAt}
                })
                CREATE (a)-[:HAD]->(c)
            `);

            // Add turns
            await this.insertTurns(id, data.turns, capturedAt);

            // Add research docs if deep research
            if (data.researchDocs && data.researchDocs.length > 0) {
                await this.insertResearchDocs(id, data.researchDocs, capturedAt);
            }
            logger.info(`[GraphStore] Synced new conversation: ${id} (${data.turns.length} turns)`);
            return { id, isNew: true };
        } else {
            // Smart merge: check if turns changed
            const turnsChanged = newTurnCount !== existingTurnCount;
            if (turnsChanged) {
                // Add only new turns
                const newTurns = data.turns.slice(existingTurnCount);
                await this.insertTurns(id, newTurns, capturedAt);

                // Update capturedAt and title
                await this.graph.query(`
                    MATCH (c:Conversation {id: '${id}'})
                    SET c.capturedAt = ${capturedAt}, c.title = '${escapeString(data.title)}'
                `);

                logger.info(`[GraphStore] Updated conversation: ${id} (${existingTurnCount} → ${newTurnCount} turns)`);
                return { id, isNew: false, turnsUpdated: true };
            } else {
                // Just update capturedAt
                await this.graph.query(`
                    MATCH (c:Conversation {id: '${id}'})
                    SET c.capturedAt = ${capturedAt}
                `);
                logger.info(`[GraphStore] Touched conversation: ${id} (${existingTurnCount} turns unchanged)`);
                return { id, isNew: false, turnsUpdated: false };
            }
        }
    }

    private tripCircuit() {
        this.circuitState = CircuitBreakerState.OPEN;
        this.lastFailure = Date.now();
        this.failureCount = 0;
        logger.error('[GraphStore] Circuit breaker tripped to OPEN state.');
    }

    private resetCircuit() {
        this.circuitState = CircuitBreakerState.CLOSED;
        this.failureCount = 0;
    }

    private halfOpenCircuit() {
        this.circuitState = CircuitBreakerState.HALF_OPEN;
    }



    /**
     * Helper to insert turns for a conversation, with inline URL citation linking
     */
    private async insertTurns(
        conversationId: string,
        turns: Array<{ role: 'user' | 'assistant'; content: string; timestamp?: number }>,
        baseTimestamp: number
    ): Promise<void> {
        // URL extraction regex
        const urlRegex = /https?:\/\/[^\s<>"\[\]()]+/g;

        for (let i = 0; i < turns.length; i++) {
            const turn = turns[i];
            const ts = turn.timestamp || baseTimestamp + i;
            const turnId = `turn_${conversationId}_${i} `;

            await this.graph!.query(`
MATCH(c: Conversation { id: '${conversationId}' })
CREATE(t: Turn {
    id: '${turnId}',
    role: '${turn.role}',
    content: '${escapeString(turn.content)}',
    timestamp: ${ts},
    idx: ${i}
                })
CREATE(c) - [: HAS_TURN] -> (t)
    `);

            // Extract URLs from assistant responses and link to Citation nodes
            if (turn.role === 'assistant') {
                const urls = turn.content.match(urlRegex) || [];
                const uniqueUrls = [...new Set(urls)];

                // Filter and batch process citations (was O(N*2), now O(2))
                const filteredUrls = uniqueUrls
                    .slice(0, 50) // Cap at 50 per turn
                    .filter(u => !u.includes('google.com/search') && !u.includes('gemini.google.com'));

                if (filteredUrls.length > 0) {
                    await this.mergeCitationsBatch(filteredUrls.map(url => ({ url, text: '', domain: '' })));
                    await this.linkCitationsToTurn(turnId, filteredUrls);
                }
            }
        }
    }

    /**
     * Helper to insert research docs for a conversation, with Citation node linking
     */
    private async insertResearchDocs(
        conversationId: string,
        docs: Array<{
            title: string;
            content: string;
            sources?: Array<{ id: number; text: string; url: string; domain: string }>;
            reasoningSteps?: Array<{ phase: string; action: string }>;
        }>,
        capturedAt: number
    ): Promise<void> {
        for (const doc of docs) {
            const docId = `doc_${conversationId}_${Math.random().toString(36).substring(2, 8)} `;
            await this.graph!.query(`
MATCH(c: Conversation { id: '${conversationId}' })
CREATE(d: ResearchDoc {
    id: '${docId}',
    title: '${escapeString(doc.title)}',
    content: '${escapeString(doc.content)}',
    sources: '${escapeString(JSON.stringify(doc.sources || []))}',
    reasoningSteps: '${escapeString(JSON.stringify(doc.reasoningSteps || []))}',
    capturedAt: ${capturedAt}
                })
CREATE(c) - [: HAS_RESEARCH_DOC] -> (d)
    `);

            // Create Citation nodes and CITES relationships (batch - was O(N*2), now O(2))
            const validSources = (doc.sources || []).filter(s => s.url);
            if (validSources.length > 0) {
                await this.mergeCitationsBatch(validSources.map(s => ({
                    url: s.url,
                    text: s.text || '',
                    domain: s.domain || ''
                })));
                await this.linkCitationsToDoc(docId, validSources.map(s => s.url));
            }
        }
    }

    /**
     * Merge a Citation node (upsert by URL)
     */
    private async mergeCitation(url: string, text: string, domain: string): Promise<string> {
        if (!this.graph) throw new Error('Not connected');
        const citationId = `cite_${createHash('md5').update(url).digest('hex').substring(0, 12)} `;
        const now = Date.now();

        // Extract domain from URL if not provided
        let domainValue = domain;
        if (!domainValue) {
            try {
                domainValue = new URL(url).hostname;
            } catch {
                domainValue = 'unknown';
            }
        }

        await this.graph.query(`
            MERGE (c:Citation {url: '${escapeString(url)}'})
            ON CREATE SET
                c.id = '${citationId.trim()}',
                c.text = '${escapeString(text)}',
                c.domain = '${escapeString(domainValue)}',
                c.firstSeenAt = ${now},
                c.lastSeenAt = ${now},
                c.count = 1
            ON MATCH SET
                c.lastSeenAt = ${now},
                c.count = c.count + 1
        `);

        return citationId.trim();
    }


    async mergeCitationsBatch(citations: Array<{ url: string; text?: string; domain?: string }>): Promise<void> {
        if (!this.graph) return;
        const validCitations = citations.filter(c => c.url);
        if (validCitations.length === 0) return;

        const now = Date.now();
        const batch = validCitations.map(c => {
            let domainValue = c.domain;
            if (!domainValue) {
                try {
                    domainValue = new URL(c.url).hostname;
                } catch {
                    domainValue = 'unknown';
                }
            }
            const citationId = `cite_${createHash('md5').update(c.url).digest('hex').substring(0, 12)} `;
            return {
                id: citationId.trim(),
                url: c.url,
                text: c.text || '',
                domain: domainValue,
                now
            };
        });

        await this.graph.query(`
            UNWIND $batch as row
            MERGE (c:Citation {url: row.url})
            ON CREATE SET
                c.id = row.id,
                c.text = row.text,
                c.domain = row.domain,
                c.firstSeenAt = row.now,
                c.lastSeenAt = row.now,
                c.count = 1
            ON MATCH SET
                c.lastSeenAt = row.now,
                c.count = c.count + 1
        `, { params: { batch } });
    }

    async linkCitationsToTurn(turnId: string, urls: string[]): Promise<void> {
        if (!this.graph || urls.length === 0) return;
        await this.graph.query(`
            MATCH (t:Turn {id: '${escapeString(turnId)}'})
            UNWIND $urls as url
            MATCH (c:Citation {url: url})
            MERGE (t)-[:REFERENCES]->(c)
        `, { params: { urls } });
    }

    async linkCitationsToDoc(docId: string, urls: string[]): Promise<void> {
        if (!this.graph || urls.length === 0) return;
        await this.graph.query(`
            MATCH (d:ResearchDoc {id: '${escapeString(docId)}'})
            UNWIND $urls as url
            MATCH (c:Citation {url: url})
            MERGE (d)-[:CITES]->(c)
        `, { params: { urls } });
    }

    private async _executeQuery<T = any>(query: string, options?: { params?: Record<string, any> }): Promise<{ data?: T[] }> {
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
            return { data: result.data as unknown as T[] };
        } catch (e: any) {
            this.failureCount++;
            if (this.circuitState === CircuitBreakerState.HALF_OPEN) {
                this.tripCircuit();
            } else if (this.circuitState === CircuitBreakerState.CLOSED && this.failureCount >= this.failureThreshold) {
            }
            throw e;
        }
    }
    /*
    <<<<<<< HEAD
    
        // Batch process all sources for this doc (was O(N*3), now O(2))
        const validSources = sources.filter(s => s.url);
        if (validSources.length > 0) {
            await this.mergeCitationsBatch(validSources.map(s => ({
                url: s.url,
                text: s.text || '',
                domain: s.domain || ''
            })));
            await this.linkCitationsToDoc(docId, validSources.map(s => s.url));
            citationsCreated += validSources.length;
        }
        processed++;
    }
    
    logger.info(`[GraphStore] Migration complete: ${processed} docs, ${citationsCreated} new citations`);
    return { processed, citations: citationsCreated };
        }
    */

    /**
     * Get all citations, optionally filtered by domain
     */
    async getCitations(options?: { domain?: string; limit?: number }): Promise<Citation[]> {
        if (!this.graph) throw new Error('Not connected');

        const limit = Number(options?.limit) || 50;
        let query = 'MATCH (c:Citation)';
        if (options?.domain) {
            query += ` WHERE c.domain = '${escapeString(options.domain)}'`;
        }
        query += ` RETURN c ORDER BY c.firstSeenAt DESC LIMIT ${limit} `;

        const result = await this.graph.query<any[]>(query);
        return (result.data || []).map((row: any) => {
            const props = row.c.properties || row.c;
            return {
                id: props.id,
                url: props.url,
                domain: props.domain,
                text: props.text,
                firstSeenAt: props.firstSeenAt
            };
        });
    }

    /**
     * Get conversations/research docs that cite a specific URL
     */
    async getCitationUsage(url: string): Promise<Array<{ type: 'ResearchDoc' | 'Turn'; id: string; title?: string }>> {
        if (!this.graph) throw new Error('Not connected');

        const results: Array<{ type: 'ResearchDoc' | 'Turn'; id: string; title?: string }> = [];

        // Find ResearchDocs that cite this URL
        const docResult = await this.graph.query<any[]>(`
MATCH(d: ResearchDoc) - [: CITES] -> (c:Citation { url: '${escapeString(url)}' })
            RETURN d.id as id, d.title as title
`);

        for (const row of (docResult.data || []) as any[]) {
            results.push({ type: 'ResearchDoc', id: row.id, title: row.title });
        }

        // Find Turns that mention this URL
        const turnResult = await this.graph.query<any[]>(`
MATCH(t: Turn) - [: MENTIONS] -> (c:Citation { url: '${escapeString(url)}' })
            RETURN t.id as id
`);

        for (const row of (turnResult.data || []) as any[]) {
            results.push({ type: 'Turn', id: row.id });
        }

        return results;
    }

    /**
     * Get conversation with content filters
     */
    async getConversationWithFilters(
        conversationId: string,
        filters: { questionsOnly?: boolean; answersOnly?: boolean; includeResearchDocs?: boolean } = {}
    ): Promise<{
        conversation: { id: string; platform: string; title: string; type: string; capturedAt: number } | null;
        turns: Array<{ role: string; content: string; timestamp: number }>;
        researchDocs?: Array<{ title: string; content: string; sources: any[]; reasoningSteps: any[] }>;
    }> {
        if (!this.graph) throw new Error('Not connected');

        // Get conversation
        const convResult = await this.graph.query<any[]>(`
MATCH(c: Conversation { id: '${escapeString(conversationId)}' })
            RETURN c
    `);

        if (!convResult.data || convResult.data.length === 0) {
            return { conversation: null, turns: [] };
        }

        const row = convResult.data[0] as any;
        const convProps = row.c?.properties || row.c || row;
        const conversation = {
            id: convProps.id,
            platform: convProps.platform,
            title: convProps.title,
            type: convProps.type,
            capturedAt: convProps.capturedAt
        };

        // Build role filter
        let roleFilter = '';
        if (filters.questionsOnly) {
            roleFilter = " AND t.role = 'user'";
        } else if (filters.answersOnly) {
            roleFilter = " AND t.role = 'assistant'";
        }

        // Get turns
        const turnsResult = await this.graph.query<any[]>(`
MATCH(c: Conversation { id: '${escapeString(conversationId)}' }) - [: HAS_TURN] -> (t:Turn)
            WHERE true ${roleFilter}
            RETURN t
            ORDER BY t.idx ASC, t.timestamp ASC
    `);

        const turns = (turnsResult.data || []).map((row: any) => {
            const props = row.t.properties || row.t;
            return {
                role: props.role,
                content: props.content,
                timestamp: props.timestamp
            };
        });

        // Get research docs if requested
        let researchDocs: any[] | undefined;
        if (filters.includeResearchDocs && conversation.type === 'deep-research') {
            const docsResult = await this.graph.query<any[]>(`
MATCH(c: Conversation { id: '${escapeString(conversationId)}' }) - [: HAS_RESEARCH_DOC] -> (d:ResearchDoc)
                RETURN d
            `);

            researchDocs = (docsResult.data || []).map((row: any) => {
                const props = row.d.properties || row.d;
                return {
                    title: props.title,
                    content: props.content,
                    sources: JSON.parse(props.sources || '[]'),
                    reasoningSteps: JSON.parse(props.reasoningSteps || '[]')
                };
            });
        }

        return { conversation, turns, researchDocs };
    }

    // ====================
    // NOTEBOOKLM SCRAPING
    // ====================

    /**
     * Sync a scraped notebook from NotebookLM.
     * Uses MERGE for idempotent upsert - repeated executions update existing nodes.
     */
    async syncNotebook(data: {
        platformId: string;
        title: string;
        sources: Array<{ type: string; title: string; url?: string }>;
        artifacts?: Array<{ type: 'audio' | 'note' | 'faq' | 'briefing' | 'timeline' | 'other'; title: string }>;
        audioOverviews?: Array<{ title: string; hasTranscript: boolean }>; // Deprecated, kept for compatibility
        messages?: Array<{ role: 'user' | 'ai'; contentPreview: string }>;
    }): Promise<{ id: string; isNew: boolean; sourcesCount: number; artifactsCount: number; messagesCount: number }> {
        if (!this.graph) throw new Error('Not connected');

        const capturedAt = Date.now();
        const id = `nb_${data.platformId} `;

        // MERGE notebook (creates if not exists, updates if exists)
        const existing = await this.graph.query<any[]>(`
MATCH(n: Notebook { platformId: '${escapeString(data.platformId)}' })
            RETURN n.id as id
`);

        const isNew = !existing.data || existing.data.length === 0;

        // Create or update notebook
        await this.graph.query(`
MERGE(a: Agent { id: 'notebooklm' })
MERGE(n: Notebook { platformId: '${escapeString(data.platformId)}' })
            ON CREATE SET
n.id = '${id}',
    n.title = '${escapeString(data.title)}',
    n.createdAt = ${capturedAt}
            ON MATCH SET
n.title = '${escapeString(data.title)}'
            SET n.capturedAt = ${capturedAt},
n.sourceCount = ${data.sources.length},
n.artifactCount = ${data.artifacts?.length || 0}
MERGE(a) - [: OWNS] -> (n)
    `);

        // MERGE sources (by title within notebook scope)
        let sourcesCount = 0;
        for (const source of data.sources) {
            await this.graph.query(`
MATCH(n: Notebook { id: '${id}' })
MERGE(s: Source { notebookId: '${id}', title: '${escapeString(source.title)}' })
                ON CREATE SET
s.id = 'src_${id}_${Math.random().toString(36).substring(2, 8)}',
    s.createdAt = ${capturedAt}
                SET s.type = '${source.type}',
    s.url = '${escapeString(source.url || '')}',
        s.updatedAt = ${capturedAt}
MERGE(n) - [: HAS_SOURCE] -> (s)
    `);
            sourcesCount++;
        }

        // MERGE artifacts (by title and type within notebook scope)
        let artifactsCount = 0;
        if (data.artifacts) {
            for (const artifact of data.artifacts) {
                await this.graph.query(`
MATCH(n: Notebook { id: '${id}' })
MERGE(art: Artifact { notebookId: '${id}', title: '${escapeString(artifact.title)}' })
                    ON CREATE SET
art.id = 'art_${id}_${Math.random().toString(36).substring(2, 8)}',
    art.createdAt = ${capturedAt}
                    SET art.type = '${artifact.type}',
    art.updatedAt = ${capturedAt}
MERGE(n) - [: HAS_ARTIFACT] -> (art)
    `);

                // Also create AudioOverview node for audio artifacts (for linking)
                if (artifact.type === 'audio') {
                    await this.graph.query(`
MATCH(n: Notebook { id: '${id}' })
MERGE(ao: AudioOverview { notebookId: '${id}', title: '${escapeString(artifact.title)}' })
                        ON CREATE SET
ao.id = 'audio_${id}_${Math.random().toString(36).substring(2, 8)}',
    ao.createdAt = ${capturedAt}
                        SET ao.updatedAt = ${capturedAt}
MERGE(n) - [: HAS_AUDIO] -> (ao)
    `);
                }

                artifactsCount++;
            }
        }

        // MERGE messages (deduplicate by content and notebookId)
        let messagesCount = 0;
        if (data.messages) {
            for (const msg of data.messages) {
                // Create a simple hash/id for the message based on content
                const contentHash = Buffer.from(msg.contentPreview).toString('base64').substring(0, 32);

                await this.graph.query(`
MATCH(n: Notebook { id: '${id}' })
MERGE(m: Message { notebookId: '${id}', contentHash: '${contentHash}' })
                    ON CREATE SET
m.id = 'msg_${id}_${Math.random().toString(36).substring(2, 8)}',
    m.createdAt = ${capturedAt},
m.role = '${msg.role}',
    m.content = '${escapeString(msg.contentPreview)}'
                    SET m.updatedAt = ${capturedAt}
MERGE(n) - [: HAS_MESSAGE] -> (m)
    `);
                messagesCount++;
            }
        }

        logger.info(`[GraphStore] ${isNew ? 'Created' : 'Updated'} notebook: ${id} (${sourcesCount} sources, ${artifactsCount} artifacts, ${messagesCount} messages)`);
        return { id, isNew, sourcesCount, artifactsCount, messagesCount };
    }

    /**
     * Link an audio overview to the sources used to generate it
     */
    async linkAudioToSources(notebookPlatformId: string, audioTitle: string, sourceTitles: string[]): Promise<void> {
        if (!this.graph) throw new Error('Not connected');

        // This assumes the AudioOverview and Sources already exist (e.g. via syncNotebook or added previously)
        // We match by title within the scope of the notebook

        logger.info(`[GraphStore] Linking audio "${audioTitle}" to ${sourceTitles.length} sources in notebook "${notebookPlatformId}"`);

        // Create relationship to each source
        for (const sourceTitle of sourceTitles) {
            await this.graph.query(`
MATCH(n: Notebook { platformId: '${escapeString(notebookPlatformId)}' }) - [: HAS_AUDIO] -> (ao:AudioOverview { title: '${escapeString(audioTitle)}' })
MATCH(n) - [: HAS_SOURCE] -> (s:Source { title: '${escapeString(sourceTitle)}' })
MERGE(ao) - [r: GENERATED_FROM] -> (s)
                SET r.createdAt = ${Date.now()}
        `);
        }
    }



    public getIsConnected(): boolean {
        return this.isConnected;
    }


    // ====================
    // LINEAGE TRACKING
    // ====================

    /**
     * Create a session node (research session on a platform)
     */
    async createSession(session: Omit<Session, 'createdAt'>): Promise<Session> {
        if (!this.graph) throw new Error('Not connected');

        const createdAt = Date.now();
        await this.graph.query(`
            CREATE (s:Session {
                id: '${escapeString(session.id)}',
                platform: '${session.platform}',
                externalId: '${escapeString(session.externalId)}',
                query: '${escapeString(session.query)}',
                createdAt: ${createdAt}
            })
        `);

        logger.info(`[GraphStore] Session created: ${session.id} (${session.platform})`);
        return { ...session, createdAt };
    }

    /**
     * Create a document node
     */
    async createDocument(doc: Omit<Document, 'createdAt'>): Promise<Document> {
        if (!this.graph) throw new Error('Not connected');

        const createdAt = Date.now();
        const url = doc.url ? escapeString(doc.url) : '';
        await this.graph.query(`
            CREATE (d:Document {
                id: '${escapeString(doc.id)}',
                title: '${escapeString(doc.title)}',
                url: '${url}',
                createdAt: ${createdAt}
            })
        `);

        logger.info(`[GraphStore] Document created: ${doc.id}`);
        return { ...doc, createdAt };
    }

    /**
     * Create an audio node
     */
    async createAudio(audio: Omit<Audio, 'createdAt'>): Promise<Audio> {
        if (!this.graph) throw new Error('Not connected');

        const createdAt = Date.now();
        await this.graph.query(`
            CREATE (a:Audio {
                id: '${escapeString(audio.id)}',
                path: '${escapeString(audio.path)}',
                duration: ${audio.duration || 0},
                createdAt: ${createdAt}
            })
        `);

        logger.info(`[GraphStore] Audio created: ${audio.id}`);
        return { ...audio, createdAt };
    }

    /**
     * Get audio for a ResearchDoc (stub for server.ts compatibility)
     */


    async disconnect(): Promise<void> {
        if (this.client) {
            await this.client.close();
            this.client = null;
            this.graph = null;
            this.isConnected = false;
        }
    }

    /**
     * Link job to session (Job - [: STARTED] -> Session)
     */
    async linkJobToSession(jobId: string, sessionId: string): Promise<void> {
        if (!this.graph) throw new Error('Not connected');

        await this.graph.query(`
            MATCH(j: Job { id: '${escapeString(jobId)}' }), (s: Session { id: '${escapeString(sessionId)}'})
            CREATE (j) - [: STARTED { createdAt: ${Date.now()}}] -> (s)
    `);

        logger.info(`[GraphStore] Linked: Job ${jobId} -> Session ${sessionId} `);
    }

    /**
     * Link session to document (Session -[:EXPORTED_TO]-> Document)
     */
    async linkSessionToDocument(sessionId: string, documentId: string): Promise<void> {
        if (!this.graph) throw new Error('Not connected');

        await this.graph.query(`
MATCH(s: Session { id: '${escapeString(sessionId)}' }), (d: Document { id: '${escapeString(documentId)}'})
            CREATE (s) - [: EXPORTED_TO { createdAt: ${Date.now()}}] -> (d)
    `);

        logger.info(`[GraphStore] Linked: Session ${sessionId} -> Document ${documentId} `);
    }

    /**
     * Link document to audio (Document -[:CONVERTED_TO]-> Audio)
     */
    async linkDocumentToAudio(documentId: string, audioId: string): Promise<void> {
        if (!this.graph) throw new Error('Not connected');

        await this.graph.query(`
MATCH(d: Document { id: '${escapeString(documentId)}' }), (a: Audio { id: '${escapeString(audioId)}'})
            CREATE (d) - [: CONVERTED_TO { createdAt: ${Date.now()}}] -> (a)
    `);

        logger.info(`[GraphStore] Linked: Document ${documentId} -> Audio ${audioId} `);
    }


    private nodeToJob(node: any): GraphJob {
        const props = node.properties || node;
        return {
            id: props.id,
            type: props.type,
            status: props.status,
            query: props.query,
            options: props.options ? (typeof props.options === 'string' ? JSON.parse(props.options) : props.options) : undefined,
            result: props.result ? (typeof props.result === 'string' ? JSON.parse(props.result) : props.result) : undefined,
            error: props.error,
            createdAt: props.createdAt,
            startedAt: props.startedAt,
            completedAt: props.completedAt
        };
    }

    private nodeToEntity(node: any): Entity {
        const props = node.properties || node;
        return {
            id: props.id,
            type: props.type || (node.labels ? node.labels[0] : 'Entity'),
            name: props.name || props.title || '',
            properties: props.properties ? (typeof props.properties === 'string' ? JSON.parse(props.properties) : props.properties) : {}
        };
    }

    async getNotebooks(limit = 50): Promise<any[]> {
        const query = `MATCH(n: Notebook) RETURN n ORDER BY n.updatedAt DESC, n.createdAt DESC LIMIT $limit`;
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
        const query = `
MATCH(n: Notebook { platformId: $platformId }) - [: CONTAINS] -> (s:Source)
            WHERE NOT(s) - [: HAS_AUDIO] -> ()
            RETURN s
        `;
        try {
            const result = await this._executeQuery<any[]>(query, { params: { platformId } });
            return (result.data || []).map(row => {
                const node = row[0] || row;
                return node.properties || node;
            });
        } catch (e) {
            console.error('[GraphStore] getSourcesWithoutAudio error:', e);
            return [];
        }
    }

    /**
     * Specialized update for Gemini sessions including deep research state.
     */
    async createOrUpdateGeminiSession(data: {
        sessionId?: string;
        id?: string;
        title: string;
        isDeepResearch?: boolean
    }): Promise<void> {
        const sessionId = data.sessionId || data.id;
        if (!sessionId) return;

        const query = `
MERGE(s: Session { platformId: $sessionId, platform: 'gemini' })
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
                    sessionId,
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

    async getConversationsByPlatform(platform: string, limit = 50): Promise<any[]> {
        const query = `
MATCH(c: Conversation { platform: $platform })
            RETURN c ORDER BY c.createdAt DESC LIMIT $limit
    `;
        try {
            const result = await this._executeQuery<any[]>(query, { params: { platform, limit } });
            return (result.data || []).map(row => {
                const node = (row as any).c || row[0] || row;
                return node.properties || node;
            });
        } catch (e) {
            console.error('[GraphStore] getConversationsByPlatform error:', e);
            return [];
        }
    }


    async getChangedConversations(since: number): Promise<any[]> {
        const query = `
MATCH(c: Conversation)
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
        const query = `MATCH(c: Conversation { id: $id }) SET c.lastExportedAt = $timestamp`;
        try {
            await this._executeQuery(query, { params: { id, timestamp } });
        } catch (e) {
            console.error('[GraphStore] updateLastExportedAt error:', e);
        }
    }

    // --- Lineage ---
    async getLineageChain(artifactId: string): Promise<any> {
        const query = `
MATCH(a { id: $id })
            OPTIONAL MATCH(j: Job) - [: GENERATED] -> (s:Session) -[: HAS_RESEARCH_DOC] -> (d:ResearchDoc) -[: HAS_AUDIO] -> (au:Audio)
            WHERE a.id IN[j.id, s.id, d.id, au.id]
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
MATCH(n { id: $id })
MATCH(n) < -[r * 1..5] - (m)
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

    async migrateCitations(): Promise<{ processed: number, citations: number }> {
        // Implementation for migrating legacy citations if needed
        return { processed: 0, citations: 0 };
    }

    // --- Audio ---
    async createResearchAudio(data: { docId?: string; researchDocId?: string; path: string; duration?: number; filename?: string; audioId?: string }): Promise<string> {
        const id = data.audioId || `au_${Date.now()} `;
        const docId = data.researchDocId || data.docId;
        if (!docId) throw new Error('docId or researchDocId is required');

        const query = `
MATCH(d: ResearchDoc { id: $docId })
CREATE(au: Audio { id: $id, path: $path, duration: $duration, filename: $filename, createdAt: $now })
MERGE(d) - [: HAS_AUDIO] -> (au)
            RETURN au.id as id
`;
        try {
            const result = await this._executeQuery<{ id: string }[]>(query, {
                params: {
                    docId,
                    path: data.path,
                    duration: data.duration || 0,
                    filename: data.filename || '',
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

    async getAudioForResearchDoc(docId: string): Promise<Audio | null> {
        const query = `MATCH(d: ResearchDoc { id: $docId }) - [: HAS_AUDIO] -> (au:Audio) RETURN au`;
        try {
            const result = await this._executeQuery<any[]>(query, { params: { docId } });
            if (result.data && result.data.length > 0) {
                const node = (result.data[0][0] || result.data[0]);
                const props = node.properties || node;
                return {
                    id: props.id,
                    path: props.path,
                    duration: props.duration,
                    createdAt: props.createdAt
                };
            }
        } catch (e) {
            console.error('[GraphStore] getAudioForResearchDoc error:', e);
        }
        return null;
    }

    async getPendingAudioByWindmillJobId(windmillJobId: string): Promise<PendingAudio | null> {
        const result = await this._executeQuery<any[]>(`MATCH(pa: PendingAudio { windmillJobId: '${escapeString(windmillJobId)}' }) RETURN pa`);
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
}

// Singleton instance
let graphStoreInstance: GraphStore | null = null;

export function getGraphStore(): GraphStore {
    if (!graphStoreInstance) {
        graphStoreInstance = new GraphStore();
    }
    return graphStoreInstance;
}
