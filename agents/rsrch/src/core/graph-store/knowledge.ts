import { GraphConnection } from './connection';
import { Entity, Relationship } from '../types/graph-store';
import { escapeString } from './utils';
import logger from '../../services/logger';

export class KnowledgeBase {
    constructor(private connection: GraphConnection) {}

    private async query<T = any>(cypher: string, params?: Record<string, any>) {
        return this.connection.query<T>(cypher, { params });
    }

    /**
     * Add an entity to the knowledge base
     */
    async addEntity(entity: Entity): Promise<void> {
        const propsJson = escapeString(JSON.stringify(entity.properties));
        await this.query(`
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
        const propsJson = rel.properties ? escapeString(JSON.stringify(rel.properties)) : '{}';
        await this.query(`
            MATCH (a:Entity {id: '${escapeString(rel.from)}'}), (b:Entity {id: '${escapeString(rel.to)}'})
            CREATE (a)-[:${rel.type} {properties: '${propsJson}', createdAt: ${Date.now()}}]->(b)
        `);

        logger.info(`[GraphStore] Relationship added: ${rel.from} -[${rel.type}]-> ${rel.to}`);
    }

    /**
     * Find entities by type
     */
    async findEntities(type: string, limit = 100): Promise<Entity[]> {
        const result = await this.query<any[]>(`
            MATCH (e:Entity {type: '${escapeString(type)}'})
            RETURN e
            LIMIT ${limit}
        `);

        return (result.data || []).map((row: any) => this.nodeToEntity(row.e || row[0]));
    }

    /**
     * Find related entities
     */
    async findRelated(entityId: string, relationshipType?: string): Promise<Entity[]> {
        let query = `MATCH (a:Entity {id: '${escapeString(entityId)}'})-[r]->(b:Entity)`;
        if (relationshipType) {
            query = `MATCH (a:Entity {id: '${escapeString(entityId)}'})-[r:${relationshipType}]->(b:Entity)`;
        }
        query += ' RETURN b';

        const result = await this.query<any[]>(query);
        return (result.data || []).map((row: any) => this.nodeToEntity(row.b || row[0]));
    }

    /**
     * Idempotently sync structured lessons into FalkorDB
     */
    async syncLessons(lessons: any[]): Promise<{ topics: number; problems: number; solutions: number }> {
        // Clean up old lessons-learned nodes
        await this.query(`
            MATCH (e:Entity)
            WHERE e.source = 'lessons_learned'
            DETACH DELETE e
        `);

        let topicCount = 0;
        let problemCount = 0;
        let solutionCount = 0;

        const createdTopics = new Set<string>();

        const localSlugify = (text: string) => {
            return text
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/(^-|-$)/g, '');
        };

        for (const lesson of lessons) {
            const problemId = lesson.id;
            const solutionId = `sol-${lesson.id}`;

            // Create Topics
            for (const topicName of lesson.topics) {
                const topicId = `topic-${localSlugify(topicName)}`;
                if (!createdTopics.has(topicId)) {
                    const topicProps = escapeString(JSON.stringify({ source: 'lessons_learned' }));
                    await this.query(`
                        CREATE (e:Entity:Topic {
                            id: '${escapeString(topicId)}',
                            type: 'Topic',
                            name: '${escapeString(topicName)}',
                            source: 'lessons_learned',
                            properties: '${topicProps}',
                            createdAt: ${Date.now()}
                        })
                    `);
                    createdTopics.add(topicId);
                    topicCount++;
                }
            }

            // Create Problem
            const problemProps = escapeString(JSON.stringify({
                source: 'lessons_learned',
                problem: lesson.problem,
                referenceUrl: lesson.referenceUrl || ''
            }));
            await this.query(`
                CREATE (e:Entity:Problem {
                    id: '${escapeString(problemId)}',
                    type: 'Problem',
                    name: '${escapeString(lesson.title)}',
                    source: 'lessons_learned',
                    properties: '${problemProps}',
                    createdAt: ${Date.now()}
                })
            `);
            problemCount++;

            // Create Solution
            const solutionProps = escapeString(JSON.stringify({
                source: 'lessons_learned',
                solution: lesson.solution
            }));
            await this.query(`
                CREATE (e:Entity:Solution {
                    id: '${escapeString(solutionId)}',
                    type: 'Solution',
                    name: 'Solution for ${escapeString(lesson.title)}',
                    source: 'lessons_learned',
                    properties: '${solutionProps}',
                    createdAt: ${Date.now()}
                })
            `);
            solutionCount++;

            // Create Relationships
            for (const topicName of lesson.topics) {
                const topicId = `topic-${localSlugify(topicName)}`;
                await this.query(`
                    MATCH (p:Entity {id: '${escapeString(problemId)}'}), (t:Entity {id: '${escapeString(topicId)}'})
                    CREATE (p)-[:RELATED_TO {createdAt: ${Date.now()}}]->(t)
                `);
            }

            await this.query(`
                MATCH (p:Entity {id: '${escapeString(problemId)}'}), (s:Entity {id: '${escapeString(solutionId)}'})
                CREATE (p)-[:SOLVED_BY {createdAt: ${Date.now()}}]->(s)
            `);
        }

        return { topics: topicCount, problems: problemCount, solutions: solutionCount };
    }

    /**
     * Case-insensitive keyword search for problems/solutions in FalkorDB
     */
    async searchKnowledge(queryText: string): Promise<any[]> {
        const q = queryText.toLowerCase();
        const result = await this.query<any[]>(`
            MATCH (p:Problem)-[:SOLVED_BY]->(s:Solution)
            WHERE p.source = 'lessons_learned' AND (
                toLower(p.name) CONTAINS $q OR
                toLower(p.properties) CONTAINS $q OR
                toLower(s.properties) CONTAINS $q
            )
            OPTIONAL MATCH (p)-[:RELATED_TO]->(t:Topic)
            RETURN p, s, collect(t) as topics
        `, { q });

        return (result.data || []).map((row: any) => {
            const probNode = row.p || row[0];
            const solNode = row.s || row[1];
            const topicNodes = row.topics || row[2] || [];

            const problem = this.nodeToEntity(probNode);
            const solution = this.nodeToEntity(solNode);
            const topics = topicNodes.map((t: any) => this.nodeToEntity(t));

            return {
                problem,
                solution,
                topics
            };
        });
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
}
