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

import * as fs from 'fs';
import * as path from 'path';

export class JobQueue {
    private jobs: Map<string, Job> = new Map();
    private persistenceFile: string;

    constructor() {
        // Ensure data directory exists and set persistence file path
        const dataDir = path.join(process.cwd(), 'data');
        if (!fs.existsSync(dataDir)) {
            try {
                fs.mkdirSync(dataDir, { recursive: true });
            } catch (e) {
                console.warn('Failed to create data directory for job persistence:', e);
            }
        }
        this.persistenceFile = path.join(dataDir, 'jobs.json');
    }

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
        this._persist();
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
        this._persist();
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
        if (removed > 0) this._persist();
        return removed;
    }

    // Persistence Methods

    private _persist() {
        try {
            const data = JSON.stringify(Array.from(this.jobs.entries()), null, 2);
            fs.writeFileSync(this.persistenceFile, data, 'utf-8');
        } catch (e) {
            console.error('Failed to persist job queue:', e);
        }
    }

    load() {
        try {
            if (fs.existsSync(this.persistenceFile)) {
                const data = fs.readFileSync(this.persistenceFile, 'utf-8');
                const entries = JSON.parse(data);
                this.jobs = new Map(entries);
                console.log(`[JobQueue] Loaded ${this.jobs.size} jobs from storage.`);
            }
        } catch (e) {
            console.error('Failed to load job queue:', e);
            // Start fresh if load fails
            this.jobs = new Map();
        }
    }
}

// Singleton instance
export const jobQueue = new JobQueue();

