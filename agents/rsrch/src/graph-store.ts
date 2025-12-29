/**
 * Graph Store - FalkorDB-based storage for jobs and knowledge
 * 
 * Provides:
 * - Job queue operations (replacing job-queue.ts)
 * - Knowledge base storage (entities, relationships)
 * - Agent memory (conversation context, facts)
 */

import { FalkorDB } from 'falkordb';
import type Graph from 'falkordb/dist/src/graph';

export interface GraphJob {
    id: string;
    type: 'query' | 'deepResearch' | 'audio-generation' | 'research-to-podcast';
    status: 'queued' | 'running' | 'completed' | 'failed';
    query: string;
    options?: Record<string, any>;
    result?: any;
    error?: string;
    createdAt: number;
    startedAt?: number;
    completedAt?: number;
}

export interface Entity {
    id: string;
    type: string;
    name: string;
    properties: Record<string, any>;
}

export interface Relationship {
    from: string;
    to: string;
    type: string;
    properties?: Record<string, any>;
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

export interface Conversation {
    id: string;
    agentId: string;
    createdAt: number;
}

export interface Turn {
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: number;
}

// Helper to escape strings for Cypher queries
function escapeString(str: string): string {
    return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"');
}

export class GraphStore {
    private client: FalkorDB | null = null;
    private graph: Graph | null = null;
    private graphName: string;
    private isConnected = false;

    constructor(graphName = 'rsrch') {
        this.graphName = graphName;
    }

    /**
     * Connect to FalkorDB
     */
    async connect(host = 'localhost', port = 6379): Promise<void> {
        if (this.isConnected) return;

        try {
            this.client = await FalkorDB.connect({ socket: { host, port } });
            this.graph = this.client.selectGraph(this.graphName);
            this.isConnected = true;
            console.log(`[GraphStore] Connected to FalkorDB at ${host}:${port}, graph: ${this.graphName}`);

            // Initialize schema
            await this.initSchema();
        } catch (e: any) {
            console.error('[GraphStore] Connection failed:', e.message);
            throw e;
        }
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
            console.log('[GraphStore] Schema initialized');
        } catch (e: any) {
            console.warn('[GraphStore] Schema init warning:', e.message);
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

        console.log(`[GraphStore] Job added: ${id} (${type})`);
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

        console.log(`[GraphStore] Job ${id} → ${status}`);
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

        console.log(`[GraphStore] Entity added: ${entity.type}:${entity.name}`);
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

        console.log(`[GraphStore] Relationship added: ${rel.from} -[${rel.type}]-> ${rel.to}`);
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

        console.log(`[GraphStore] Conversation started: ${id} for agent ${agentId}`);
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

            console.log(`[GraphStore] Synced new conversation: ${id} (${data.turns.length} turns)`);
            return { id, isNew: true };
        } else {
            // Smart merge: check if turns changed
            const turnsChanged = newTurnCount !== existingTurnCount;

            if (turnsChanged && newTurnCount > 0) {
                // Delete old turns and insert new ones
                await this.graph.query(`
                    MATCH (c:Conversation {id: '${id}'})-[:HAS_TURN]->(t:Turn)
                    DETACH DELETE t
                `);

                // Insert new turns
                await this.insertTurns(id, data.turns, capturedAt);

                // Update capturedAt and title
                await this.graph.query(`
                    MATCH (c:Conversation {id: '${id}'})
                    SET c.capturedAt = ${capturedAt}, c.title = '${escapeString(data.title)}'
                `);

                console.log(`[GraphStore] Updated conversation: ${id} (${existingTurnCount} → ${newTurnCount} turns)`);
                return { id, isNew: false, turnsUpdated: true };
            } else {
                // Just update capturedAt
                await this.graph.query(`
                    MATCH (c:Conversation {id: '${id}'})
                    SET c.capturedAt = ${capturedAt}
                `);
                console.log(`[GraphStore] Touched conversation: ${id} (${existingTurnCount} turns unchanged)`);
                return { id, isNew: false, turnsUpdated: false };
            }
        }
    }

    /**
     * Helper to insert turns for a conversation
     */
    private async insertTurns(
        conversationId: string,
        turns: Array<{ role: 'user' | 'assistant'; content: string; timestamp?: number }>,
        baseTimestamp: number
    ): Promise<void> {
        for (let i = 0; i < turns.length; i++) {
            const turn = turns[i];
            const ts = turn.timestamp || baseTimestamp + i;
            await this.graph!.query(`
                MATCH (c:Conversation {id: '${conversationId}'})
                CREATE (t:Turn {
                    role: '${turn.role}',
                    content: '${escapeString(turn.content)}',
                    timestamp: ${ts},
                    idx: ${i}
                })
                CREATE (c)-[:HAS_TURN]->(t)
            `);
        }
    }

    /**
     * Helper to insert research docs for a conversation
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
            const docId = `doc_${conversationId}_${Math.random().toString(36).substring(2, 8)}`;
            await this.graph!.query(`
                MATCH (c:Conversation {id: '${conversationId}'})
                CREATE (d:ResearchDoc {
                    id: '${docId}',
                    title: '${escapeString(doc.title)}',
                    content: '${escapeString(doc.content)}',
                    sources: '${escapeString(JSON.stringify(doc.sources || []))}',
                    reasoningSteps: '${escapeString(JSON.stringify(doc.reasoningSteps || []))}',
                    capturedAt: ${capturedAt}
                })
                CREATE (c)-[:HAS_RESEARCH_DOC]->(d)
            `);
        }
    }

    /**
     * Get conversations by platform
     */
    async getConversationsByPlatform(
        platform: 'gemini' | 'perplexity',
        limit = 50
    ): Promise<Array<{
        id: string;
        platformId: string;
        title: string;
        type: string;
        createdAt: number;
        capturedAt: number;
        turnCount: number;
    }>> {
        if (!this.graph) throw new Error('Not connected');

        const result = await this.graph.query<any[]>(`
            MATCH (c:Conversation {platform: '${platform}'})
            OPTIONAL MATCH (c)-[:HAS_TURN]->(t:Turn)
            RETURN c, count(t) as turnCount
            ORDER BY c.capturedAt DESC
            LIMIT ${Number(limit) || 50}
        `);

        return (result.data || []).map((row: any) => {
            const props = row.c.properties || row.c;
            return {
                id: props.id,
                platformId: props.platformId,
                title: props.title,
                type: props.type,
                createdAt: props.createdAt,
                capturedAt: props.capturedAt,
                turnCount: row.turnCount || 0
            };
        });
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
            MATCH (c:Conversation {id: '${escapeString(conversationId)}'})
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
            MATCH (c:Conversation {id: '${escapeString(conversationId)}'})-[:HAS_TURN]->(t:Turn)
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
                MATCH (c:Conversation {id: '${escapeString(conversationId)}'})-[:HAS_RESEARCH_DOC]->(d:ResearchDoc)
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
        const id = `nb_${data.platformId}`;

        // MERGE notebook (creates if not exists, updates if exists)
        const existing = await this.graph.query<any[]>(`
            MATCH (n:Notebook {platformId: '${escapeString(data.platformId)}'})
            RETURN n.id as id
        `);

        const isNew = !existing.data || existing.data.length === 0;

        // Create or update notebook
        await this.graph.query(`
            MERGE (a:Agent {id: 'notebooklm'})
            MERGE (n:Notebook {platformId: '${escapeString(data.platformId)}'})
            ON CREATE SET 
                n.id = '${id}',
                n.title = '${escapeString(data.title)}',
                n.createdAt = ${capturedAt}
            ON MATCH SET 
                n.title = '${escapeString(data.title)}'
            SET n.capturedAt = ${capturedAt},
                n.sourceCount = ${data.sources.length},
                n.artifactCount = ${data.artifacts?.length || 0}
            MERGE (a)-[:OWNS]->(n)
        `);

        // MERGE sources (by title within notebook scope)
        let sourcesCount = 0;
        for (const source of data.sources) {
            await this.graph.query(`
                MATCH (n:Notebook {id: '${id}'})
                MERGE (s:Source {notebookId: '${id}', title: '${escapeString(source.title)}'})
                ON CREATE SET 
                    s.id = 'src_${id}_${Math.random().toString(36).substring(2, 8)}',
                    s.createdAt = ${capturedAt}
                SET s.type = '${source.type}',
                    s.url = '${escapeString(source.url || '')}',
                    s.updatedAt = ${capturedAt}
                MERGE (n)-[:HAS_SOURCE]->(s)
            `);
            sourcesCount++;
        }

        // MERGE artifacts (by title and type within notebook scope)
        let artifactsCount = 0;
        if (data.artifacts) {
            for (const artifact of data.artifacts) {
                await this.graph.query(`
                    MATCH (n:Notebook {id: '${id}'})
                    MERGE (art:Artifact {notebookId: '${id}', title: '${escapeString(artifact.title)}'})
                    ON CREATE SET 
                        art.id = 'art_${id}_${Math.random().toString(36).substring(2, 8)}',
                        art.createdAt = ${capturedAt}
                    SET art.type = '${artifact.type}',
                        art.updatedAt = ${capturedAt}
                    MERGE (n)-[:HAS_ARTIFACT]->(art)
                `);
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
                    MATCH (n:Notebook {id: '${id}'})
                    MERGE (m:Message {notebookId: '${id}', contentHash: '${contentHash}'})
                    ON CREATE SET 
                        m.id = 'msg_${id}_${Math.random().toString(36).substring(2, 8)}',
                        m.createdAt = ${capturedAt},
                        m.role = '${msg.role}',
                        m.content = '${escapeString(msg.contentPreview)}'
                    SET m.updatedAt = ${capturedAt}
                    MERGE (n)-[:HAS_MESSAGE]->(m)
                `);
                messagesCount++;
            }
        }

        console.log(`[GraphStore] ${isNew ? 'Created' : 'Updated'} notebook: ${id} (${sourcesCount} sources, ${artifactsCount} artifacts, ${messagesCount} messages)`);
        return { id, isNew, sourcesCount, artifactsCount, messagesCount };
    }

    /**
     * Link an audio overview to the sources used to generate it
     */
    async linkAudioToSources(notebookPlatformId: string, audioTitle: string, sourceTitles: string[]): Promise<void> {
        if (!this.graph) throw new Error('Not connected');

        // This assumes the AudioOverview and Sources already exist (e.g. via syncNotebook or added previously)
        // We match by title within the scope of the notebook

        console.log(`[GraphStore] Linking audio "${audioTitle}" to ${sourceTitles.length} sources in notebook "${notebookPlatformId}"`);

        // Create relationship to each source
        for (const sourceTitle of sourceTitles) {
            await this.graph.query(`
                MATCH (n:Notebook {platformId: '${escapeString(notebookPlatformId)}'})-[:HAS_AUDIO]->(ao:AudioOverview {title: '${escapeString(audioTitle)}'})
                MATCH (n)-[:HAS_SOURCE]->(s:Source {title: '${escapeString(sourceTitle)}'})
                MERGE (ao)-[r:GENERATED_FROM]->(s)
                SET r.createdAt = ${Date.now()}
            `);
        }
    }

    /**
     * Get all notebooks
     */
    async getNotebooks(limit = 50): Promise<Array<{
        id: string;
        title: string;
        sourceCount: number;
        audioCount: number;
        capturedAt: number;
    }>> {
        if (!this.graph) throw new Error('Not connected');

        const result = await this.graph.query<any[]>(`
            MATCH (n:Notebook)
            RETURN n
            ORDER BY n.capturedAt DESC
            LIMIT ${limit}
        `);

        return (result.data || []).map((row: any) => {
            const props = row.n.properties || row.n;
            return {
                id: props.id,
                title: props.title,
                sourceCount: props.sourceCount || 0,
                audioCount: props.audioCount || 0,
                capturedAt: props.capturedAt
            };
        });
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

        console.log(`[GraphStore] Session created: ${session.id} (${session.platform})`);
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

        console.log(`[GraphStore] Document created: ${doc.id}`);
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

        console.log(`[GraphStore] Audio created: ${audio.id}`);
        return { ...audio, createdAt };
    }

    /**
     * Link job to session (Job -[:STARTED]-> Session)
     */
    async linkJobToSession(jobId: string, sessionId: string): Promise<void> {
        if (!this.graph) throw new Error('Not connected');

        await this.graph.query(`
            MATCH (j:Job {id: '${escapeString(jobId)}'}), (s:Session {id: '${escapeString(sessionId)}'})
            CREATE (j)-[:STARTED {createdAt: ${Date.now()}}]->(s)
        `);

        console.log(`[GraphStore] Linked: Job ${jobId} -> Session ${sessionId}`);
    }

    /**
     * Link session to document (Session -[:EXPORTED_TO]-> Document)
     */
    async linkSessionToDocument(sessionId: string, documentId: string): Promise<void> {
        if (!this.graph) throw new Error('Not connected');

        await this.graph.query(`
            MATCH (s:Session {id: '${escapeString(sessionId)}'}), (d:Document {id: '${escapeString(documentId)}'})
            CREATE (s)-[:EXPORTED_TO {createdAt: ${Date.now()}}]->(d)
        `);

        console.log(`[GraphStore] Linked: Session ${sessionId} -> Document ${documentId}`);
    }

    /**
     * Link document to audio (Document -[:CONVERTED_TO]-> Audio)
     */
    async linkDocumentToAudio(documentId: string, audioId: string): Promise<void> {
        if (!this.graph) throw new Error('Not connected');

        await this.graph.query(`
            MATCH (d:Document {id: '${escapeString(documentId)}'}), (a:Audio {id: '${escapeString(audioId)}'})
            CREATE (d)-[:CONVERTED_TO {createdAt: ${Date.now()}}]->(a)
        `);

        console.log(`[GraphStore] Linked: Document ${documentId} -> Audio ${audioId}`);
    }

    /**
     * Get full lineage chain for any artifact ID
     * Returns the chain from Job -> Session -> Document -> Audio
     */
    async getLineage(artifactId: string): Promise<any[]> {
        if (!this.graph) throw new Error('Not connected');

        // Try to find lineage starting from any node type
        const result = await this.graph.query<any[]>(`
            MATCH path = (start)-[*0..5]->(end)
            WHERE start.id = '${escapeString(artifactId)}' OR end.id = '${escapeString(artifactId)}'
            UNWIND nodes(path) AS n
            RETURN DISTINCT n
            ORDER BY n.createdAt ASC
        `);

        return (result.data || []).map((row: any) => {
            const node = row.n;
            return {
                id: node.properties?.id,
                type: node.labels?.[0],
                ...node.properties
            };
        });
    }

    /**
     * Get lineage by following the chain from a starting node
     */
    async getLineageChain(startId: string): Promise<{
        job?: GraphJob;
        session?: Session;
        document?: Document;
        audio?: Audio;
    }> {
        if (!this.graph) throw new Error('Not connected');

        const result = await this.graph.query<any[]>(`
            MATCH (j:Job)-[:STARTED]->(s:Session)-[:EXPORTED_TO]->(d:Document)
            OPTIONAL MATCH (d)-[:CONVERTED_TO]->(a:Audio)
            WHERE j.id = '${escapeString(startId)}' 
               OR s.id = '${escapeString(startId)}' 
               OR d.id = '${escapeString(startId)}'
               OR a.id = '${escapeString(startId)}'
            RETURN j, s, d, a
            LIMIT 1
        `);

        if (!result.data || result.data.length === 0) {
            return {};
        }

        const row = result.data[0] as any;
        return {
            job: row.j ? this.nodeToJob(row.j) : undefined,
            session: row.s ? this.nodeToSession(row.s) : undefined,
            document: row.d ? this.nodeToDocument(row.d) : undefined,
            audio: row.a ? this.nodeToAudio(row.a) : undefined
        };
    }

    // ====================
    // HELPERS
    // ====================

    private nodeToJob(node: any): GraphJob {
        const props = node.properties || node;
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
        const props = node.properties || node;
        return {
            id: props.id,
            type: props.type,
            name: props.name,
            properties: props.properties ? JSON.parse(props.properties) : {}
        };
    }

    private nodeToSession(node: any): Session {
        const props = node.properties || node;
        return {
            id: props.id,
            platform: props.platform,
            externalId: props.externalId,
            query: props.query,
            createdAt: props.createdAt
        };
    }

    private nodeToDocument(node: any): Document {
        const props = node.properties || node;
        return {
            id: props.id,
            title: props.title,
            url: props.url || undefined,
            createdAt: props.createdAt
        };
    }

    private nodeToAudio(node: any): Audio {
        const props = node.properties || node;
        return {
            id: props.id,
            path: props.path,
            duration: props.duration || undefined,
            createdAt: props.createdAt
        };
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
