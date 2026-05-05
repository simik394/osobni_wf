import { GraphConnection } from './connection';
import { Conversation, Turn } from '../types/graph-store';
import { escapeString } from './utils';
import logger from '../../services/logger';

export class ConversationManager {
    constructor(private connection: GraphConnection) {}

    private async query<T = any>(cypher: string, params?: Record<string, any>) {
        return this.connection.query<T>(cypher, { params });
    }

    /**
     * Store a fact for an agent
     */
    async storeFact(agentId: string, fact: string, context?: Record<string, any>): Promise<void> {
        const factId = Math.random().toString(36).substring(2, 12);
        const contextJson = context ? escapeString(JSON.stringify(context)) : '{}';

        await this.query(`
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
        const result = await this.query<any[]>(`
            MATCH (a:Agent {id: '${escapeString(agentId)}'})-[:KNOWS]->(f:Fact)
            RETURN f.content
            ORDER BY f.createdAt DESC
            LIMIT ${limit}
        `);

        return (result.data || []).map((row: any) => row['f.content'] || row[0]);
    }

    /**
     * Start a new conversation for an agent
     */
    async startConversation(agentId: string): Promise<Conversation> {
        const id = Math.random().toString(36).substring(2, 12);
        const createdAt = Date.now();

        await this.query(`
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
        const timestamp = Date.now();

        // Create turn and link to conversation
        await this.query(`
            MATCH (c:Conversation {id: '${escapeString(conversationId)}'})
            CREATE (t:Turn {
                role: '${role}',
                content: '${escapeString(content)}',
                timestamp: ${timestamp}
            })
            CREATE (c)-[:HAS_TURN]->(t)
        `);

        // Link to previous turn if exists
        await this.query(`
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
        const result = await this.query<any[]>(`
            MATCH (c:Conversation {id: '${escapeString(conversationId)}'})-[:HAS_TURN]->(t:Turn)
            RETURN t
            ORDER BY t.timestamp ASC
        `);

        return (result.data || []).map((row: any) => {
            const props = row.t?.properties || row.t || row[0];
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
        const result = await this.query<any[]>(`
            MATCH (a:Agent {id: '${escapeString(agentId)}'})-[:HAD]->(c:Conversation)
            RETURN c
            ORDER BY c.createdAt DESC
            LIMIT ${limit}
        `);

        return (result.data || []).map((row: any) => {
            const props = row.c?.properties || row.c || row[0];
            return {
                id: props.id,
                agentId: props.agentId,
                createdAt: props.createdAt,
                title: props.title,
                platform: props.platform
            };
        });
    }

    /**
     * Get conversation with filters (legacy support for exporter)
     */
    async getConversationWithFilters(id: string, filters: any): Promise<any> {
        // Simple implementation for now to satisfy types
        const turns = await this.getConversation(id);
        const result = await this.query<any[]>(`
            MATCH (c:Conversation {id: '${escapeString(id)}'})
            OPTIONAL MATCH (c)-[:PRODUCED]->(d:ResearchDoc)
            RETURN c, collect(d) as docs
        `);

        if (result.data && result.data.length > 0) {
            const row = result.data[0];
            const conv = row.c?.properties || row.c;
            return {
                ...conv,
                turns,
                researchDocs: (row.docs || []).map((d: any) => d.properties || d)
            };
        }
        return { turns: [], researchDocs: [] };
    }

    async getConversationsByPlatform(platform: string, limit = 50): Promise<any[]> {
        const result = await this.query<any[]>(`
            MATCH (c:Conversation {platform: '${escapeString(platform)}'})
            RETURN c ORDER BY c.createdAt DESC LIMIT ${limit}
        `);
        return (result.data || []).map(row => (row.c?.properties || row.c || row[0]));
    }

    async getConversationState(platformId: string, platform: string): Promise<{ exists: boolean; id?: string; updatedAt?: number }> {
        const result = await this.query<any[]>(`
            MATCH (c:Conversation {platformId: '${escapeString(platformId)}', platform: '${escapeString(platform)}'})
            RETURN c.id as id, c.updatedAt as updatedAt
        `);
        
        if (result.data && result.data.length > 0) {
            return {
                exists: true,
                id: result.data[0].id,
                updatedAt: result.data[0].updatedAt
            };
        }
        return { exists: false };
    }

    async getChangedConversations(since: number): Promise<any[]> {
        const result = await this.query<any[]>(`
            MATCH (c:Conversation)
            WHERE c.updatedAt > ${since} OR c.createdAt > ${since}
            RETURN c ORDER BY c.updatedAt DESC
        `);
        return (result.data || []).map(row => (row.c?.properties || row.c || row[0]));
    }

    async updateLastExportedAt(id: string, timestamp: number): Promise<void> {
        await this.query(`
            MATCH (c:Conversation { id: '${escapeString(id)}' }) 
            SET c.lastExportedAt = ${timestamp}
        `);
    }

    /**
     * Sync a conversation and its turns (upsert)
     */
    async syncConversation(data: {
        platform: 'gemini' | 'perplexity' | 'aimode';
        platformId: string;
        title: string;
        type: 'regular' | 'deep-research';
        turns: Array<{ role: 'user' | 'assistant'; content: string; timestamp?: number }>;
        researchDocs?: any[];
    }): Promise<{ id: string; isNew: boolean; turnsUpdated?: boolean }> {
        const capturedAt = Date.now();
        const id = `conv_${data.platformId}`; // Match test expectation

        // Check if conversation already exists
        const existing = await this.query<any[]>(`
            MATCH (c:Conversation {platformId: '${escapeString(data.platformId)}', platform: '${data.platform}'})
            OPTIONAL MATCH (c)-[:HAS_TURN]->(t:Turn)
            RETURN c.id as id, count(t) as turnCount
        `);

        const isNew = !existing.data || existing.data.length === 0;
        const existingTurnCount = isNew ? 0 : ((existing.data as any[])[0]?.turnCount ?? 0);
        const newTurnCount = data.turns.length;

        if (isNew) {
            await this.query(`
                MERGE (a:Agent {id: '${data.platform}'})
                CREATE (c:Conversation {
                    id: '${id}',
                    platformId: '${escapeString(data.platformId)}',
                    platform: '${data.platform}',
                    title: '${escapeString(data.title)}',
                    type: '${data.type}',
                    createdAt: ${capturedAt},
                    capturedAt: ${capturedAt},
                    updatedAt: ${capturedAt}
                })
                CREATE (a)-[:HAD]->(c)
            `);
        } else {
            await this.query(`
                MATCH (c:Conversation {id: '${id}'})
                SET c.title = '${escapeString(data.title)}',
                    c.updatedAt = ${capturedAt}
            `);
        }

        // Only add new turns if count increased
        if (newTurnCount > existingTurnCount) {
            const newTurns = data.turns.slice(existingTurnCount);
            await this.insertTurns(id, newTurns, capturedAt);
        }

        return { id, isNew, turnsUpdated: newTurnCount > existingTurnCount };
    }

    private async insertTurns(
        conversationId: string,
        turns: Array<{ role: 'user' | 'assistant'; content: string; timestamp?: number }>,
        capturedAt: number
    ): Promise<void> {
        for (const turn of turns) {
            const timestamp = turn.timestamp || capturedAt;
            await this.query(`
                MATCH (c:Conversation { id: '${conversationId}' })
                CREATE (t:Turn {
                    role: '${turn.role}',
                    content: '${escapeString(turn.content)}',
                    timestamp: ${timestamp}
                })
                CREATE (c)-[:HAS_TURN]->(t)
            `);
        }
    }
}
