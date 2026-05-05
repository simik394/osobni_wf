import { FalkorDB } from 'falkordb';
import type Graph from 'falkordb/dist/src/graph';
import logger from '../../services/logger';
import { NetworkError } from '../../clients/errors';

export enum CircuitBreakerState {
    CLOSED = 'CLOSED',
    OPEN = 'OPEN',
    HALF_OPEN = 'HALF_OPEN',
}

export class GraphConnection {
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

    async disconnect(): Promise<void> {
        if (this.client) {
            await this.client.close();
            this.client = null;
            this.graph = null;
            this.isConnected = false;
        }
    }

    public getIsConnected(): boolean {
        return this.isConnected;
    }

    public getGraph(): Graph {
        if (!this.graph) throw new Error('[GraphStore] Not connected to graph');
        return this.graph;
    }

    /**
     * Internal query executor with circuit breaker and retry logic
     */
    async query<T = any>(cypher: string, options: { params?: Record<string, any> } = {}): Promise<{ data: T | null; statistics: any }> {
        if (!this.isConnected || !this.graph) {
            throw new Error('[GraphStore] Not connected');
        }

        if (!this.checkCircuit()) {
            throw new Error('[GraphStore] Circuit breaker is OPEN');
        }

        try {
            const result = await this.graph.query(cypher, options.params);
            this.resetCircuit();
            return {
                data: (result as any).data as T,
                statistics: (result as any).statistics
            };
        } catch (e: any) {
            this.failureCount++;
            if (this.failureCount >= this.failureThreshold) {
                this.tripCircuit();
            }
            logger.error(`[GraphStore] Query failed: ${e.message}`, { cypher, params: options.params });
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
            await this.graph.createNodeRangeIndex('PendingAudio', 'id').catch(() => { });
            await this.graph.createNodeRangeIndex('PendingAudio', 'status').catch(() => { });
            await this.graph.createNodeRangeIndex('Entity', 'id').catch(() => { });
            await this.graph.createNodeRangeIndex('Entity', 'name').catch(() => { });
            await this.graph.createNodeRangeIndex('Conversation', 'id').catch(() => { });
            await this.graph.createNodeRangeIndex('Citation', 'id').catch(() => { });
            await this.graph.createNodeRangeIndex('Session', 'id').catch(() => { });
            await this.graph.createNodeRangeIndex('Source', 'id').catch(() => { });
        } catch (e: any) {
            logger.warn(`[GraphStore] Schema initialization warning: ${e.message}`);
        }
    }

    // --- Circuit Breaker ---

    private tripCircuit() {
        this.circuitState = CircuitBreakerState.OPEN;
        this.lastFailure = Date.now();
        logger.warn('[GraphStore] Circuit breaker TRIPPED (OPEN)');
    }

    private resetCircuit() {
        this.circuitState = CircuitBreakerState.CLOSED;
        this.failureCount = 0;
    }

    public checkCircuit(): boolean {
        if (this.circuitState === CircuitBreakerState.OPEN) {
            if (Date.now() - this.lastFailure > this.resetTimeout) {
                this.circuitState = CircuitBreakerState.HALF_OPEN;
                return true;
            }
            return false;
        }
        return true;
    }
}
