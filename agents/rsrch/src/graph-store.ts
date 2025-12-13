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
            const node = result.data[0][0];
            return this.nodeToJob(node);
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

        return (result.data || []).map((row) => this.nodeToJob(row[0]));
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
            return this.nodeToJob(result.data[0][0]);
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

        return (result.data || []).map((row) => this.nodeToEntity(row[0]));
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
        return (result.data || []).map((row) => this.nodeToEntity(row[0]));
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

        return (result.data || []).map((row) => row[0]);
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
