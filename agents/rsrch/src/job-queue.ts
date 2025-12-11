/**
 * Job Queue for managing async long-running tasks
 */

export interface Job {
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

export class JobQueue {
    private jobs: Map<string, Job> = new Map();

    generateId(): string {
        return Math.random().toString(36).substring(2, 10);
    }

    add(type: Job['type'], query: string, options?: Record<string, any>): Job {
        const job: Job = {
            id: this.generateId(),
            type,
            status: 'queued',
            query,
            options,
            createdAt: Date.now()
        };
        this.jobs.set(job.id, job);
        return job;
    }

    get(id: string): Job | undefined {
        return this.jobs.get(id);
    }

    list(): Job[] {
        return Array.from(this.jobs.values()).sort((a, b) => b.createdAt - a.createdAt);
    }

    update(id: string, updates: Partial<Job>): Job | undefined {
        const job = this.jobs.get(id);
        if (!job) return undefined;
        Object.assign(job, updates);
        return job;
    }

    markRunning(id: string): void {
        this.update(id, { status: 'running', startedAt: Date.now() });
    }

    markCompleted(id: string, result: any): void {
        this.update(id, { status: 'completed', result, completedAt: Date.now() });
    }

    markFailed(id: string, error: string): void {
        this.update(id, { status: 'failed', error, completedAt: Date.now() });
    }

    cleanup(maxAgeMs: number = 24 * 60 * 60 * 1000): number {
        const now = Date.now();
        let removed = 0;
        for (const [id, job] of this.jobs) {
            if (job.completedAt && now - job.completedAt > maxAgeMs) {
                this.jobs.delete(id);
                removed++;
            }
        }
        return removed;
    }
}

// Singleton instance
export const jobQueue = new JobQueue();
