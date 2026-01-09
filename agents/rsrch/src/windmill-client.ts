/**
 * Windmill Client - Trigger Windmill jobs from rsrch server
 * 
 * This centralizes all Windmill API calls to prevent race conditions
 * by routing audio generation through Windmill's job queue.
 * 
 * IMPORTANT: Every job trigger creates a PendingAudio in FalkorDB
 * for real-time state tracking (per GEMINI.md mandate).
 */

import { getGraphStore, type PendingAudio } from './graph-store';

export interface WindmillJobResult {
    jobId: string;
    pendingAudioId?: string;  // FalkorDB tracking ID
    success: boolean;
    error?: string;
}

export interface AudioGenerationParams {
    notebookTitle: string;
    sourceTitle: string;
    customPrompt?: string;
}

export class WindmillClient {
    private token: string;
    private baseUrl: string;
    private workspace: string;

    constructor() {
        this.token = process.env.WINDMILL_TOKEN || '';
        this.baseUrl = process.env.WINDMILL_URL || 'http://localhost:8000';
        this.workspace = process.env.WINDMILL_WORKSPACE || 'knowlage';

        if (!this.token) {
            console.warn('[WindmillClient] WINDMILL_TOKEN not set - job triggering will fail');
        }
    }

    /**
     * Check if Windmill is configured
     */
    isConfigured(): boolean {
        return !!this.token;
    }

    /**
     * Trigger audio generation for a single source
     * Returns immediately with job ID (non-blocking per GEMINI.md architecture)
     */
    async triggerAudioGeneration(params: AudioGenerationParams): Promise<WindmillJobResult> {
        const url = `${this.baseUrl}/api/w/${this.workspace}/jobs/run/p/f/audio/click_generate_audio`;

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    notebook_title: params.notebookTitle,
                    source_title: params.sourceTitle,
                    custom_prompt: params.customPrompt
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                return {
                    jobId: '',
                    success: false,
                    error: `Windmill API error ${response.status}: ${errorText}`
                };
            }

            // Windmill returns job UUID as plain text
            const jobId = await response.text();
            return {
                jobId: jobId.trim().replace(/"/g, ''),
                success: true
            };
        } catch (error: any) {
            return {
                jobId: '',
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Queue multiple audio generations with FalkorDB state tracking
     * Each source gets its own Windmill job for parallel execution
     * 
     * IMPORTANT: Creates PendingAudio in FalkorDB BEFORE triggering Windmill
     * This ensures state is tracked from the moment user requests generation
     */
    async queueAudioGenerations(
        notebookTitle: string,
        sources: string[],
        customPrompt?: string,
        options?: { graphStore?: ReturnType<typeof getGraphStore> }
    ): Promise<{ queued: WindmillJobResult[]; failed: WindmillJobResult[]; pendingAudios: PendingAudio[] }> {
        const queued: WindmillJobResult[] = [];
        const failed: WindmillJobResult[] = [];
        const pendingAudios: PendingAudio[] = [];

        // Get or use provided graph store
        const store = options?.graphStore || getGraphStore();
        let isConnected = false;

        try {
            // Connect to FalkorDB for state tracking
            const graphHost = process.env.FALKORDB_HOST || 'localhost';
            const graphPort = parseInt(process.env.FALKORDB_PORT || '6379');
            await store.connect(graphHost, graphPort);
            isConnected = true;
        } catch (e: any) {
            console.warn(`[WindmillClient] FalkorDB not available: ${e.message}`);
            // Continue without state tracking if FalkorDB unavailable
        }

        for (const source of sources) {
            let pendingAudio: PendingAudio | undefined;

            // Step 1: Create PendingAudio BEFORE triggering Windmill
            if (isConnected) {
                try {
                    pendingAudio = await store.createPendingAudio(
                        notebookTitle,
                        [source],
                        { customPrompt }
                    );
                    pendingAudios.push(pendingAudio);
                } catch (e: any) {
                    console.error(`[WindmillClient] Failed to create PendingAudio: ${e.message}`);
                }
            }

            // Step 2: Trigger Windmill job
            const result = await this.triggerAudioGeneration({
                notebookTitle,
                sourceTitle: source,
                customPrompt
            });

            // Step 3: Update PendingAudio with Windmill job ID
            if (pendingAudio && isConnected) {
                try {
                    if (result.success) {
                        await store.updatePendingAudioStatus(pendingAudio.id, 'started', {
                            windmillJobId: result.jobId
                        });
                    } else {
                        await store.updatePendingAudioStatus(pendingAudio.id, 'failed', {
                            error: result.error || 'Windmill job trigger failed'
                        });
                    }
                } catch (e: any) {
                    console.error(`[WindmillClient] Failed to update PendingAudio: ${e.message}`);
                }
            }

            if (result.success) {
                queued.push({
                    ...result,
                    pendingAudioId: pendingAudio?.id,
                    error: source  // Reuse for source name
                });
            } else {
                failed.push({
                    ...result,
                    pendingAudioId: pendingAudio?.id,
                    error: `${source}: ${result.error}`
                });
            }
        }

        // Don't disconnect - let caller manage connection

        return { queued, failed, pendingAudios };
    }

    /**
     * Get job status (optional - for monitoring)
     */
    async getJobStatus(jobId: string): Promise<any> {
        const url = `${this.baseUrl}/api/w/${this.workspace}/jobs_u/get/${jobId}`;

        try {
            const response = await fetch(url, {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
            return await response.json();
        } catch (error) {
            return { error: 'Failed to get job status' };
        }
    }
}

// Singleton instance
let windmillClientInstance: WindmillClient | null = null;

export function getWindmillClient(): WindmillClient {
    if (!windmillClientInstance) {
        windmillClientInstance = new WindmillClient();
    }
    return windmillClientInstance;
}
