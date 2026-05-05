import { GraphConnection } from './connection';
import { Session, Document, Audio } from '../types/graph-store';
import { escapeString } from './utils';
import logger from '../../services/logger';

export class ResearchManager {
    constructor(private connection: GraphConnection) {}

    private async query<T = any>(cypher: string, params?: Record<string, any>) {
        return this.connection.query<T>(cypher, { params });
    }

    /**
     * Creates or updates a Session node.
     */
    async createOrUpdateSession(session: Partial<Session>): Promise<void> {
        if (!session.id) return;

        const platform = session.platform || 'gemini';
        const externalId = session.externalId || session.id;
        const queryStr = session.query || '';
        const title = session.title || '';

        await this.query(`
            MERGE (s:Session { platformId: '${escapeString(externalId)}', platform: '${platform}' })
            ON CREATE SET
                s.id = '${escapeString(session.id)}',
                s.externalId = '${escapeString(externalId)}',
                s.query = '${escapeString(queryStr)}',
                s.title = '${escapeString(title)}',
                s.status = '${session.status || 'pending'}',
                s.createdAt = ${session.createdAt || Date.now()}
            ON MATCH SET
                s.title = CASE WHEN '${escapeString(title)}' <> '' THEN '${escapeString(title)}' ELSE s.title END,
                s.status = CASE WHEN '${session.status || ''}' <> '' THEN '${session.status}' ELSE s.status END,
                s.updatedAt = ${Date.now()}
        `);
    }

    /**
     * Synchronize a Notebook node.
     */
    async syncNotebook(data: { platformId: string; title: string; url?: string }): Promise<{ isNew: boolean, id: string }> {
        const id = `nb_${data.platformId}`;
        const now = Date.now();

        const result = await this.query<any[]>(`
            MERGE (n:Notebook { platformId: '${escapeString(data.platformId)}' })
            ON CREATE SET
                n.id = '${id}',
                n.title = '${escapeString(data.title)}',
                n.url = '${escapeString(data.url || '')}',
                n.createdAt = ${now},
                n._isNew = true
            ON MATCH SET
                n.title = '${escapeString(data.title)}',
                n.url = '${escapeString(data.url || '')}',
                n.updatedAt = ${now},
                n._isNew = false
            RETURN n.id as id, n._isNew as isNew
        `);

        if (result.data && result.data.length > 0) {
            const row = result.data[0] as any;
            return {
                id: row.id || row[0],
                isNew: !!(row.isNew !== undefined ? row.isNew : row[1])
            };
        }
        return { isNew: false, id };
    }

    /**
     * Save a Document node.
     */
    async saveDocument(doc: Document): Promise<void> {
        await this.query(`
            MERGE (d:Document { id: '${escapeString(doc.id)}' })
            ON CREATE SET
                d.title = '${escapeString(doc.title)}',
                d.url = '${escapeString(doc.url || '')}',
                d.createdAt = ${doc.createdAt || Date.now()}
        `);
    }

    /**
     * Save an Audio node.
     */
    async saveAudio(audio: Audio): Promise<void> {
        await this.query(`
            MERGE (a:Audio { id: '${escapeString(audio.id)}' })
            ON CREATE SET
                a.path = '${escapeString(audio.path)}',
                a.createdAt = ${audio.createdAt || Date.now()}
        `);
    }

    /**
     * Link Research Job to Session
     */
    async linkJobToSession(jobId: string, sessionId: string): Promise<void> {
        await this.query(`
            MATCH (j:Job { id: '${escapeString(jobId)}' })
            MATCH (s:Session { id: '${escapeString(sessionId)}' })
            MERGE (j)-[:RELATED_TO]->(s)
        `);
    }

    /**
     * Link Session to Document
     */
    async linkSessionToDocument(sessionId: string, documentId: string): Promise<void> {
        await this.query(`
            MATCH (s:Session { id: '${escapeString(sessionId)}' })
            MATCH (d:Document { id: '${escapeString(documentId)}' })
            MERGE (s)-[:PRODUCED]->(d)
        `);
    }

    /**
     * Link Document to Audio
     */
    /**
     * Link Document to Audio
     */
    async linkDocumentToAudio(documentId: string, audioId: string): Promise<void> {
        await this.query(`
            MATCH (d:Document { id: '${escapeString(documentId)}' })
            MATCH (a:Audio { id: '${escapeString(audioId)}' })
            MERGE (d)-[:CONVERTED_TO]->(a)
        `);
    }

    /**
     * Get lineage of a node (predecessors)
     */
    async getLineage(nodeId: string): Promise<any[]> {
        const result = await this.query<any[]>(`
            MATCH (n { id: $id })
            MATCH (n)<-[r*1..5]-(m)
            RETURN m, r
        `, { id: nodeId });

        return (result.data || []).map(row => (row.m?.properties || row.m || row[0]));
    }

    /**
     * Get lineage chain for an artifact
     */
    async getLineageChain(artifactId: string): Promise<any> {
        const result = await this.query<any[]>(`
            MATCH (a { id: $id })
            OPTIONAL MATCH (j:Job)-[:GENERATED]->(s:Session)-[:HAS_RESEARCH_DOC]->(d:ResearchDoc)-[:HAS_AUDIO]->(au:Audio)
            WHERE a.id IN [j.id, s.id, d.id, au.id]
            RETURN j, s, d, au
        `, { id: artifactId });

        if (result.data && result.data.length > 0) {
            const row = result.data[0] as any;
            return {
                job: (row.j || row[0])?.properties || null,
                session: (row.s || row[1])?.properties || null,
                document: (row.d || row[2])?.properties || null,
                audio: (row.au || row[3])?.properties || null
            };
        }
        return { job: null, session: null, document: null, audio: null };
    }

    async getNotebooks(limit = 50): Promise<any[]> {
        const result = await this.query<any[]>(`
            MATCH (n:Notebook) 
            RETURN n ORDER BY n.updatedAt DESC, n.createdAt DESC LIMIT $limit
        `, { limit });
        return (result.data || []).map(row => (row.n?.properties || row.n || row[0]));
    }

    async getSourcesWithoutAudio(platformId: string): Promise<any[]> {
        const result = await this.query<any[]>(`
            MATCH (n:Notebook {platformId: $platformId})-[:HAS_RESEARCH_DOC]->(d:ResearchDoc)
            WHERE NOT (d)-[:HAS_AUDIO]->()
            RETURN d
        `, { platformId });
        return (result.data || []).map(row => (row.d?.properties || row.d || row[0]));
    }

    /**
     * Get audio associated with a ResearchDoc
     */
    async getAudioForResearchDoc(docId: string): Promise<Audio | null> {
        const result = await this.query<any[]>(`
            MATCH (d:ResearchDoc { id: $docId })-[:HAS_AUDIO]->(au:Audio) 
            RETURN au
        `, { docId });

        if (result.data && result.data.length > 0) {
            const node = result.data[0].au || result.data[0];
            const props = node.properties || node;
            return {
                id: props.id,
                path: props.path,
                duration: props.duration,
                createdAt: props.createdAt
            };
        }
        return null;
    }

    /**
     * Create audio and link to ResearchDoc
     */
    async createResearchAudio(data: { docId?: string; researchDocId?: string; path: string; duration?: number; filename?: string; audioId?: string }): Promise<string> {
        const id = data.audioId || `au_${Date.now()}`;
        const docId = data.researchDocId || data.docId;
        if (!docId) throw new Error('docId or researchDocId is required');

        await this.query(`
            MATCH (d:ResearchDoc { id: $docId })
            CREATE (au:Audio { id: $id, path: $path, duration: $duration, filename: $filename, createdAt: $now })
            MERGE (d)-[:HAS_AUDIO]->(au)
            RETURN au.id as id
        `, {
            docId,
            path: data.path,
            duration: data.duration || 0,
            filename: data.filename || '',
            id,
            now: Date.now()
        });

        return id;
    }

    /**
     * Workflow Execution management
     */
    async createWorkflowExecution(execution: any): Promise<void> {
        await this.query(`
            CREATE (w:WorkflowExecution {
                id: $id,
                workflowName: $workflowName,
                status: $status,
                startTime: $startTime,
                results: $results,
                error: $error
            })
        `, {
            id: execution.id,
            workflowName: execution.workflowName,
            status: execution.status,
            startTime: execution.startTime,
            results: JSON.stringify(execution.results || {}),
            error: execution.error || ''
        });
    }

    async updateWorkflowExecution(execution: any): Promise<void> {
        let set = `w.status = $status, w.results = $results`;
        if (execution.endTime) set += `, w.endTime = $endTime`;
        if (execution.error) set += `, w.error = $error`;

        await this.query(`MATCH (w:WorkflowExecution {id: $id}) SET ${set}`, {
            id: execution.id,
            status: execution.status,
            results: JSON.stringify(execution.results || {}),
            endTime: execution.endTime || 0,
            error: execution.error || ''
        });
    }

    async updateStepExecution(executionId: string, step: any): Promise<void> {
        await this.query(`
            MATCH (w:WorkflowExecution {id: $executionId})
            MERGE (s:StepExecution {id: $stepId, workflowExecutionId: $executionId})
            ON CREATE SET
                s.status = $status,
                s.startTime = $startTime,
                s.endTime = $endTime,
                s.result = $result,
                s.error = $error
            ON MATCH SET
                s.status = $status,
                s.startTime = $startTime,
                s.endTime = $endTime,
                s.result = $result,
                s.error = $error
            MERGE (w)-[:HAS_STEP]->(s)
        `, {
            executionId,
            stepId: step.id,
            status: step.status,
            startTime: step.startTime || 0,
            endTime: step.endTime || 0,
            result: JSON.stringify(step.result || {}),
            error: step.error || ''
        });
    }
}
