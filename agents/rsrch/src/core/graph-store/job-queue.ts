import { GraphConnection } from './connection';
import { GraphJob, PendingAudio, PendingAudioStatus } from '../types/graph-store';
import { escapeString } from './utils';
import logger from '../../services/logger';

export class JobQueue {
    constructor(private connection: GraphConnection) {}

    private async query<T = any>(cypher: string, params?: Record<string, any>) {
        return this.connection.query<T>(cypher, { params });
    }

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

        await this.query(`
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
        const result = await this.query<any[]>(`
            MATCH (j:Job {id: '${escapeString(id)}'})
            RETURN j
        `);

        if (result.data && result.data.length > 0) {
            const row = result.data[0] as any;
            return this.nodeToJob(row.j || row[0]);
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

        const result = await this.query<any[]>(query);

        return (result.data || []).map((row: any) => this.nodeToJob(row.j || row[0]));
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

        await this.query(`
            MATCH (j:Job {id: '${escapeString(id)}'})
            SET ${setClause}
        `);

        logger.info(`[GraphStore] Job ${id} → ${status}`);
    }

    /**
     * Get next queued job (FIFO)
     */
    async getNextQueuedJob(): Promise<GraphJob | null> {
        const result = await this.query<any[]>(`
            MATCH (j:Job {status: 'queued'})
            RETURN j
            ORDER BY j.createdAt ASC
            LIMIT 1
        `);

        if (result.data && result.data.length > 0) {
            const row = result.data[0] as any;
            return this.nodeToJob(row.j || row[0]);
        }
        return null;
    }

    /**
     * Create a PendingAudio node when audio generation is queued
     */
    async createPendingAudio(
        notebookTitle: string,
        sources: string[],
        options?: { windmillJobId?: string; customPrompt?: string }
    ): Promise<PendingAudio> {
        const id = `pa_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
        const now = Date.now();

        await this.query(`
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

        await this.query(`
            MATCH (pa:PendingAudio {id: '${escapeString(id)}'})
            SET ${setClause}
        `);

        logger.info(`[GraphStore] PendingAudio ${id} → ${status}`);
    }

    /**
     * Get a PendingAudio by ID
     */
    async getPendingAudio(id: string): Promise<PendingAudio | null> {
        const result = await this.query<any[]>(`
            MATCH (pa:PendingAudio {id: '${escapeString(id)}'})
            RETURN pa
        `);

        if (result.data && result.data.length > 0) {
            const row = result.data[0] as any;
            return this.nodeToPendingAudio(row.pa || row[0]);
        }
        return null;
    }

    async getPendingAudioByWindmillJobId(windmillJobId: string): Promise<PendingAudio | null> {
        const result = await this.query<any[]>(`
            MATCH (pa:PendingAudio {windmillJobId: '${escapeString(windmillJobId)}'})
            RETURN pa
        `);
        if (result.data && result.data.length > 0) {
            const row = result.data[0] as any;
            return this.nodeToPendingAudio(row.pa || row[0]);
        }
        return null;
    }

    /**
     * List all pending audios
     */
    async listPendingAudios(status?: PendingAudioStatus): Promise<PendingAudio[]> {
        const whereClause = status ? `WHERE pa.status = '${status}'` : '';
        const result = await this.query<any[]>(`
            MATCH (pa:PendingAudio)
            ${whereClause}
            RETURN pa
            ORDER BY pa.createdAt DESC
            LIMIT 50
        `);

        if (!result.data) return [];

        return result.data.map((row: any) => this.nodeToPendingAudio(row.pa || row[0]));
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

    private nodeToPendingAudio(node: any): PendingAudio {
        const props = node.properties || node;
        return {
            id: props.id,
            notebookTitle: props.notebookTitle,
            sources: typeof props.sources === 'string' ? JSON.parse(props.sources || '[]') : (props.sources || []),
            status: props.status,
            windmillJobId: props.windmillJobId || undefined,
            customPrompt: props.customPrompt || undefined,
            createdAt: props.createdAt,
            startedAt: props.startedAt,
            completedAt: props.completedAt,
            error: props.error,
            resultAudioId: props.resultAudioId
        };
    }
}
