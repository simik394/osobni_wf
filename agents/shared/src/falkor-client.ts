/**
 * FalkorDB Client for Shared Agent State
 * 
 * Provides persistent session management and interaction logging
 * across all agents (rsrch, angrav, etc.)
 */

import axios from 'axios';
import Redis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';

// ============================================================================
// Types
// ============================================================================

export interface Session {
    id: string;
    name: string;
    workspace: string;
    createdAt: number;
    lastActiveAt: number;
    status: 'active' | 'completed' | 'pending';
}

export interface Interaction {
    id: string;
    sessionId: string;
    agent: string;
    type: 'query' | 'response' | 'action';
    content: string;
    timestamp: number;
}

export interface Artifact {
    id: string;
    sessionId: string;
    path: string;
    type: 'file' | 'directory' | 'url';
    createdAt: number;
}

// ============================================================================
// FalkorDB Client
// ============================================================================

export class FalkorClient {
    private redis: Redis;
    private graphName: string;

    constructor(
        host: string = process.env.FALKORDB_HOST || 'localhost',
        port: number = parseInt(process.env.FALKORDB_PORT || '6379'),
        graphName: string = 'angrav'
    ) {
        this.redis = new Redis({ host, port });
        this.graphName = graphName;
    }

    /**
     * Execute a Cypher query against FalkorDB
     */
    public async query(cypher: string, params: Record<string, any> = {}): Promise<any[]> {
        // Build parameter string for GRAPH.QUERY
        const paramStr = Object.entries(params)
            .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
            .join(' ');

        const cmd = paramStr
            ? `CYPHER ${paramStr} ${cypher}`
            : cypher;

        try {
            const result = await this.redis.call('GRAPH.QUERY', this.graphName, cmd);
            return this.parseResult(result);
        } catch (error) {
            console.error('FalkorDB query error:', error);
            throw error;
        }
    }

    /**
     * Parse FalkorDB result into usable format
     * FalkorDB returns: [headers, [row1], [row2], ..., stats]
     */
    private parseResult(result: any): any[] {
        if (!result || !Array.isArray(result) || result.length < 2) return [];

        const headers = result[0];
        const data = result[1];

        // Safety check: data must be an array
        if (!Array.isArray(data)) return [];

        return data.map((row: any[]) => {
            const obj: Record<string, any> = {};
            headers.forEach((header: string, i: number) => {
                obj[header] = this.parseNode(row[i]);
            });
            return obj;
        });
    }

    /**
     * Parse a node from FalkorDB response
     * Node format: [[[key1, val1], [key2, val2], ...]]
     * Where one of the keys is "properties" with value [k1, v1, k2, v2, ...]
     */
    private parseNode(node: any): any {
        if (!Array.isArray(node) || node.length === 0) return node;

        // Unwrap outer array if needed
        let fields = node;
        while (Array.isArray(fields) && fields.length === 1 && Array.isArray(fields[0])) {
            fields = fields[0];
        }

        // Check if it's a list of [key, value] pairs
        if (!Array.isArray(fields[0]) || fields[0].length !== 2) return node;

        const result: Record<string, any> = {};

        for (const field of fields) {
            if (!Array.isArray(field) || field.length < 2) continue;
            const [key, value] = field;

            if (key === 'properties' && Array.isArray(value)) {
                // Properties are [[k1, v1], [k2, v2], ...]
                for (const prop of value) {
                    if (Array.isArray(prop) && prop.length >= 2) {
                        result[prop[0]] = prop[1];
                    }
                }
            } else if (key === 'labels') {
                result._labels = value;
            } else if (key === 'id') {
                result._nodeId = value;
            }
        }

        return result;
    }

    // ========================================================================
    // Session Management
    // ========================================================================

    /**
     * Create a new session with a stable UUID
     */
    async createSession(name: string, workspace: string): Promise<string> {
        const id = uuidv4();
        const now = Date.now();

        await this.query(`
            CREATE (s:Session {
                id: $id,
                name: $name,
                workspace: $workspace,
                createdAt: $now,
                lastActiveAt: $now,
                status: 'active'
            })
        `, { id, name, workspace, now });

        console.log(`📝 Created session: ${name} (${id})`);
        return id;
    }

    /**
     * Get session by ID
     */
    async getSession(id: string): Promise<Session | null> {
        const results = await this.query(`
            MATCH (s:Session {id: $id})
            RETURN s
        `, { id });

        return results.length > 0 ? results[0].s : null;
    }

    /**
     * Find session by ID or Name (most recent)
     */
    async findSession(nameOrId: string): Promise<Session | null> {
        // Try exact ID match
        const byId = await this.getSession(nameOrId);
        if (byId) return byId;

        // Try name match (any workspace, most recent)
        const results = await this.query(`
            MATCH (s:Session {name: $name})
            RETURN s
            ORDER BY s.lastActiveAt DESC
            LIMIT 1
        `, { name: nameOrId });

        return results.length > 0 ? results[0].s : null;
    }

    /**
     * Find session by name and workspace
     */
    async findSessionByName(name: string, workspace: string): Promise<Session | null> {
        const results = await this.query(`
            MATCH (s:Session {name: $name, workspace: $workspace})
            RETURN s
            ORDER BY s.lastActiveAt DESC
            LIMIT 1
        `, { name, workspace });

        return results.length > 0 ? results[0].s : null;
    }

    /**
     * Update session name (when topic changes)
     */
    async updateSessionName(id: string, newName: string): Promise<void> {
        await this.query(`
            MATCH (s:Session {id: $id})
            SET s.name = $newName, s.lastActiveAt = $now
        `, { id, newName, now: Date.now() });
    }

    /**
     * Update session last active timestamp
     */
    async touchSession(id: string): Promise<void> {
        await this.query(`
            MATCH (s:Session {id: $id})
            SET s.lastActiveAt = $now
        `, { id, now: Date.now() });
    }

    /**
     * List all sessions, optionally filtered by workspace
     */
    async listSessions(workspace?: string): Promise<Session[]> {
        const cypher = workspace
            ? `MATCH (s:Session {workspace: $workspace}) RETURN s ORDER BY s.lastActiveAt DESC`
            : `MATCH (s:Session) RETURN s ORDER BY s.lastActiveAt DESC`;

        const results = await this.query(cypher, workspace ? { workspace } : {});
        return results.map(r => r.s);
    }

    /**
     * Mark session as completed
     */
    async completeSession(id: string): Promise<void> {
        await this.query(`
            MATCH (s:Session {id: $id})
            SET s.status = 'completed', s.lastActiveAt = $now
        `, { id, now: Date.now() });
    }

    // ========================================================================
    // Interaction Logging
    // ========================================================================

    /**
     * Log an interaction (query, response, or action)
     */
    async logInteraction(
        sessionId: string,
        agent: string,
        type: 'query' | 'response' | 'action',
        content: string
    ): Promise<string> {
        const id = uuidv4();
        const timestamp = Date.now();

        // Truncate content to avoid huge nodes
        const truncatedContent = content.length > 1000
            ? content.slice(0, 1000) + '...'
            : content;

        await this.query(`
            MATCH (s:Session {id: $sessionId})
            CREATE (i:Interaction {
                id: $id,
                agent: $agent,
                type: $type,
                content: $content,
                timestamp: $timestamp
            })
            CREATE (s)-[:HAS_INTERACTION]->(i)
        `, { sessionId, id, agent, type, content: truncatedContent, timestamp });

        // Also update session lastActiveAt
        await this.touchSession(sessionId);

        return id;
    }

    /**
     * Get recent interactions for a session
     */
    async getInteractions(sessionId: string, limit: number = 10): Promise<Interaction[]> {
        const results = await this.query(`
            MATCH (s:Session {id: $sessionId})-[:HAS_INTERACTION]->(i:Interaction)
            RETURN i
            ORDER BY i.timestamp DESC
            LIMIT $limit
        `, { sessionId, limit });

        return results.map(r => ({ ...r.i, sessionId }));
    }

    // ========================================================================
    // Artifact Tracking
    // ========================================================================

    /**
     * Track an artifact produced by an interaction
     */
    async trackArtifact(
        sessionId: string,
        path: string,
        type: 'file' | 'directory' | 'url'
    ): Promise<string> {
        const id = uuidv4();
        const createdAt = Date.now();

        await this.query(`
            MATCH (s:Session {id: $sessionId})
            CREATE (a:Artifact {
                id: $id,
                path: $path,
                type: $type,
                createdAt: $createdAt
            })
            CREATE (s)-[:PRODUCED]->(a)
        `, { sessionId, id, path, type, createdAt });

        return id;
    }

    /**
     * Get artifacts for a session
     */
    async getArtifacts(sessionId: string): Promise<Artifact[]> {
        const results = await this.query(`
            MATCH (s:Session {id: $sessionId})-[:PRODUCED]->(a:Artifact)
            RETURN a
            ORDER BY a.createdAt DESC
        `, { sessionId });

        return results.map(r => ({ ...r.a, sessionId }));
    }

    // ========================================================================
    // Phase 5: Advanced Features (Stubs for TDD)
    // ========================================================================

    async syncServicesFromConsul(): Promise<void> {
        try {
            // Assume ENV var or default
            const consulUrl = process.env.CONSUL_HTTP_ADDR || 'http://localhost:8500';
            const resp = await axios.get(`${consulUrl}/v1/catalog/services`);
            const services = Object.keys(resp.data);
            const now = Date.now();

            for (const svcName of services) {
                // For MVP, we just mark existence. Detailed checking would hit /v1/catalog/service/${svcName}
                await this.query(`
                    MERGE (s:Service {name: $name})
                    SET s.lastSeen = $now,
                        s.status = 'online'
                `, { name: svcName, now });
            }
        } catch (err) {
            console.error('Failed to sync from Consul:', err);
            // Don't throw to avoid killing agent loops, but for tests maybe we should?
            // keeping it safe for now.
        }
    }

    async resolveService(serviceName: string): Promise<{ address: string, port: number } | null> {
        // Fallback: Query FalkorDB for the service
        const results = await this.query(`
            MATCH (s:Service {name: $name, status: 'online'})
            RETURN s.address, s.port
            ORDER BY s.lastSeen DESC
            LIMIT 1
        `, { name: serviceName });

        if (results.length > 0) {
            return {
                address: results[0]['s.address'],
                port: results[0]['s.port']
            };
        }
        return null;
    }

    async acquireLock(resourcePath: string, sessionId: string, ttlSeconds: number): Promise<boolean> {
        const key = `lock:${resourcePath}`;
        // Atomic acquire: Set if Not Exists
        const result = await this.redis.set(key, sessionId, 'EX', ttlSeconds, 'NX');

        if (result === 'OK') {
            // Sync to Graph
            await this.query(`
                MERGE (r:Resource {path: $path})
                SET r.in_use = true,
                    r.locked_by = $sid,
                    r.status = 'locked'
                WITH r
                MATCH (s:Session {id: $sid})
                MERGE (s)-[:LOCKED]->(r)
            `, { path: resourcePath, sid: sessionId });

            return true;
        }

        return false;
    }

    async releaseLock(resourcePath: string, sessionId: string): Promise<void> {
        const key = `lock:${resourcePath}`;
        const currentOwner = await this.redis.get(key);

        if (currentOwner === sessionId) {
            await this.redis.del(key);

            // Sync to Graph
            await this.query(`
                MATCH (r:Resource {path: $path})
                SET r.in_use = false,
                    r.locked_by = null,
                    r.status = 'available'
                WITH r
                MATCH (s:Session {id: $sid})-[l:LOCKED]->(r)
                DELETE l
            `, { path: resourcePath, sid: sessionId });
        }
    }

    async trackCost(sessionId: string, model: string, inputTokens: number, outputTokens: number): Promise<void> {
        // Simple hardcoded pricing (per 1M tokens) - Example values
        const pricing: Record<string, { in: number, out: number }> = {
            'gpt-4': { in: 5.0, out: 15.0 },
            'gpt-3.5-turbo': { in: 0.5, out: 1.5 },
            'default': { in: 1.0, out: 2.0 }
        };

        const price = pricing[model] || pricing['default'];
        const costUsd = ((inputTokens * price.in) + (outputTokens * price.out)) / 1_000_000;
        const id = uuidv4();
        const timestamp = Date.now();

        await this.query(`
            MATCH (s:Session {id: $sid})
            CREATE (c:Cost {
                id: $id,
                model: $model,
                tokens: $tokens,
                amountUsd: $amount,
                timestamp: $ts
            })
            CREATE (s)-[:INCURRED]->(c)
        `, {
            sid: sessionId,
            id,
            model,
            tokens: inputTokens + outputTokens,
            amount: costUsd,
            ts: timestamp
        });
    }

    async createTask(goalId: string, title: string, description: string): Promise<string> {
        const id = uuidv4();
        const now = Date.now();

        await this.query(`
            MATCH (g:Goal {id: $gid})
            MERGE (t:Task {
                id: $id,
                title: $title,
                description: $desc,
                status: 'pending',
                createdAt: $now
            })
            MERGE (g)-[:HAS_SUBTASK]->(t)
        `, { gid: goalId, id, title, desc: description, now });

        return id;
    }

    // ========================================================================
    // Utilities
    // ========================================================================

    /**
     * Close the Redis connection
     */
    async close(): Promise<void> {
        await this.redis.quit();
    }

    /**
     * Create indexes for efficient lookups
     */
    async ensureIndexes(): Promise<void> {
        try {
            await this.query('CREATE INDEX FOR (s:Session) ON (s.id)');
            await this.query('CREATE INDEX FOR (s:Session) ON (s.name)');
            await this.query('CREATE INDEX FOR (s:Session) ON (s.workspace)');
            await this.query('CREATE INDEX FOR (i:Interaction) ON (i.id)');
            await this.query('CREATE INDEX FOR (a:Artifact) ON (a.id)');
            console.log('✅ FalkorDB indexes created');
        } catch (error) {
            // Indexes may already exist
            console.log('ℹ️ Indexes already exist or creation skipped');
        }
    }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let _instance: FalkorClient | null = null;

/**
 * Get or create the shared FalkorDB client instance
 */
export function getFalkorClient(): FalkorClient {
    if (!_instance) {
        _instance = new FalkorClient();
    }
    return _instance;
}

export default FalkorClient;
