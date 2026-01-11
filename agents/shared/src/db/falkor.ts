import { FalkorDB } from 'falkordb';
import type Graph from 'falkordb/dist/src/graph';
import { NetworkError } from '../errors';
import { getLogger } from '../logger';

// Helper to escape strings for Cypher queries
export function escapeString(str: string): string {
    if (typeof str !== 'string') return '';
    return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"');
}

enum CircuitBreakerState {
    CLOSED = 'CLOSED',
    OPEN = 'OPEN',
    HALF_OPEN = 'HALF_OPEN',
}

export interface FalkorConfig {
    host: string;
    port: number;
    graphName: string;
    maxRetries?: number;
    retryDelay?: number;
}

export class FalkorClient {
    private client: FalkorDB | null = null;
    private graph: Graph | null = null;
    private config: FalkorConfig;
    private isConnected = false;

    // Circuit Breaker properties
    private circuitState: CircuitBreakerState = CircuitBreakerState.CLOSED;
    private failureCount = 0;
    private lastFailure = 0;
    private readonly failureThreshold = 5; // Trip after 5 consecutive failures
    private readonly resetTimeout = 30000; // 30 seconds in OPEN state

    constructor(config: FalkorConfig) {
        this.config = config;
    }

    /**
     * Connect to FalkorDB with retry logic.
     */
    async connect(): Promise<void> {
        if (this.isConnected) return;

        const maxRetries = this.config.maxRetries || 3;
        const retryDelay = this.config.retryDelay || 2000;

        for (let i = 0; i < maxRetries; i++) {
            try {
                this.client = await FalkorDB.connect({
                    socket: {
                        host: this.config.host,
                        port: this.config.port
                    }
                });
                this.graph = this.client.selectGraph(this.config.graphName);
                this.isConnected = true;
                this.resetCircuit();
                getLogger().info(`[FalkorClient] Connected to FalkorDB at ${this.config.host}:${this.config.port}, graph: ${this.config.graphName}`);
                return;
            } catch (e: any) {
                getLogger().warn(`[FalkorClient] Connection attempt ${i + 1}/${maxRetries} failed:`, e.message);
                if (i < maxRetries - 1) {
                    await new Promise(resolve => setTimeout(resolve, retryDelay * (i + 1)));
                } else {
                    this.tripCircuit();
                    throw new NetworkError(`[FalkorClient] Connection failed after ${maxRetries} attempts: ${e.message}`);
                }
            }
        }
    }

    private tripCircuit() {
        this.circuitState = CircuitBreakerState.OPEN;
        this.lastFailure = Date.now();
        this.failureCount = 0;
        getLogger().error('[FalkorClient] Circuit breaker tripped to OPEN state.');
    }

    private resetCircuit() {
        this.circuitState = CircuitBreakerState.CLOSED;
        this.failureCount = 0;
        getLogger().info('[FalkorClient] Circuit breaker reset to CLOSED state.');
    }

    private halfOpenCircuit() {
        this.circuitState = CircuitBreakerState.HALF_OPEN;
        getLogger().info('[FalkorClient] Circuit breaker moved to HALF_OPEN state.');
    }

    /**
     * Execute a Cypher query with circuit breaker protection
     */
    async executeQuery<T = any[]>(query: string, options?: { params?: Record<string, any> }): Promise<{ data?: T }> {
        // Check circuit breaker state
        if (this.circuitState === CircuitBreakerState.OPEN) {
            if (Date.now() - this.lastFailure > this.resetTimeout) {
                this.halfOpenCircuit();
            } else {
                throw new NetworkError('FalkorClient circuit breaker is open. Queries are temporarily blocked.');
            }
        }

        if (!this.graph) throw new NetworkError('Not connected to FalkorDB');

        try {
            const result = await this.graph.query<T>(query, options);

            if (this.circuitState === CircuitBreakerState.HALF_OPEN) {
                this.resetCircuit();
            }
            this.failureCount = 0; // Reset on any success
            // Force type casting to match expected return type, falkordb result.data is T[] usually
            return result as { data?: T };
        } catch (e: any) {
            this.failureCount++;

            if (this.circuitState === CircuitBreakerState.HALF_OPEN) {
                this.tripCircuit();
            }
            else if (this.circuitState === CircuitBreakerState.CLOSED && this.failureCount >= this.failureThreshold) {
                this.tripCircuit();
            }

            getLogger().error(`[FalkorClient] Cypher query failed: ${e.message}`, { query });
            throw new Error(`[FalkorClient] Query execution failed: ${e.message}`);
        }
    }

    async disconnect(): Promise<void> {
        if (this.client) {
            await this.client.close();
            this.client = null;
            this.graph = null;
            this.isConnected = false;
            getLogger().info('[FalkorClient] Disconnected');
        }
    }

    getIsConnected(): boolean {
        return this.isConnected;
    }
}
