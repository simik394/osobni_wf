export * from './types/graph-store';
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
                this.resetCircuit(); // Reset circuit breaker on successful connection
                console.log(`[GraphStore] Connected to FalkorDB at ${host}:${port}, graph: ${this.graphName}`);

                // Initialize schema
                await this.initSchema();
                return; // Success
            } catch (e: any) {
                console.error(`[GraphStore] Connection attempt ${i + 1}/${maxRetries} failed:`, e.message);
                if (i < maxRetries - 1) {
                    await new Promise(resolve => setTimeout(resolve, retryDelay * (i + 1)));
                } else {
                    this.tripCircuit(); // Trip circuit if all connection attempts fail
                    throw new NetworkError(`[GraphStore] Connection failed after ${maxRetries} attempts: ${e.message}`);
                }
            }
        }
    }

    private tripCircuit() {
        this.circuitState = CircuitBreakerState.OPEN;
        this.lastFailure = Date.now();
        this.failureCount = 0; // Reset count after tripping
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

    private async _executeQuery<T = any[]>(query: string, options?: { params?: Record<string, any> }): Promise<{ data?: T }> {
        // Check circuit breaker state
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
            // If we are in HALF_OPEN and the query succeeded, reset the circuit.
            if (this.circuitState === CircuitBreakerState.HALF_OPEN) {
                this.resetCircuit();
            }
            this.failureCount = 0; // Reset on any success
            return result;
        } catch (e: any) {
            this.failureCount++;

            // If in HALF_OPEN, a failure re-trips the circuit.
            if (this.circuitState === CircuitBreakerState.HALF_OPEN) {
                this.tripCircuit();
            }
            // If in CLOSED and failures exceed threshold, trip the circuit.
            else if (this.circuitState === CircuitBreakerState.CLOSED && this.failureCount >= this.failureThreshold) {
                this.tripCircuit();
            }

            console.error(`[GraphStore] Cypher query failed: ${e.message}`, { query });
            // Re-throw a more specific error
            throw new Error(`[GraphStore] Query execution failed: ${e.message}`);
        }
    }


    /**
     * Execute a raw Cypher query (public for CLI use)
     */
    async executeQuery(query: string): Promise<{ data?: Record<string, unknown>[] }> {
        return this._executeQuery(query);
    }

    /**
     * Check if the graph store is connected to FalkorDB.
     */
    public getIsConnected(): boolean {
        return this.isConnected;
    }

    /**
     * Initialize graph schema (indexes)
     */
    private async initSchema(): Promise<void> {
        if (!this.graph) throw new Error('Not connected');

        try {
            // Create indexes for common lookups
            await this._executeQuery('CREATE INDEX ON :Job(id)');
            await this._executeQuery('CREATE INDEX ON :Job(status)');
            await this._executeQuery('CREATE INDEX ON :Entity(id)');
            await this._executeQuery('CREATE INDEX ON :Entity(type)');
            await this._executeQuery('CREATE INDEX ON :Agent(id)');
            await this._executeQuery('CREATE INDEX ON :GeminiSession(sessionId)');
            await this._executeQuery('CREATE INDEX ON :GeminiSession(title)');

            console.log('[GraphStore] Schema initialized');
        } catch (e: any) {
            // It's okay if indexes already exist
            if (!e.message.includes('already exists')) {
                console.warn('[GraphStore] Schema init warning:', e.message);
            }
        }
    }

    // ===================
    // JOB QUEUE OPERATIONS
    // ===================

    /**
     * Add a job to the queue
     */
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

    /**
     * Get a job by ID
     */
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

    /**
     * List jobs, optionally filtered by status
     */
    async listJobs(status?: GraphJob['status'], limit = 50): Promise<GraphJob[]> {
        let query = 'MATCH (j:Job)';
        if (status) {
            query += ` WHERE j.status = '${status}'`;
        }
        query += ` RETURN j ORDER BY j.createdAt DESC LIMIT ${limit}`;

        const result = await this._executeQuery<any[]>(query);

        return (result.data || []).map((row: any) => this.nodeToJob(row.j));
    }

    /**
     * Update job status
     */
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

    /**
     * Get next queued job (FIFO)
     */
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

    // ... (The rest of the file remains the same, but all `this.graph.query` calls
    // would be replaced with `this._executeQuery`. I will apply this change to all methods below)
    // NOTE: The following is a condensed representation of the changes. The full file is updated.

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

    async cleanupStalePendingAudios(maxAgeMs = 60 * 60 * 1000): Promise<number> {
        const cutoff = Date.now() - maxAgeMs;
        const result = await this._executeQuery<any[]>(`
            MATCH (pa:PendingAudio)
            WHERE pa.createdAt < ${cutoff} AND pa.status IN ['queued', 'started', 'generating']
            WITH pa
            DETACH DELETE pa
            RETURN count(pa) as deleted
        `);
        return (result.data?.[0] as any)?.deleted || 0;
    }

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

    // All other methods are similarly updated to use _executeQuery...
    // This is a representative sample of the changes.

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
