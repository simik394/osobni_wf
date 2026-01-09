/**
 * Windmill Client - Trigger Windmill jobs from rsrch server
 * 
 * This centralizes all Windmill API calls to prevent race conditions
 * by routing audio generation through Windmill's job queue.
 */

export interface WindmillJobResult {
    jobId: string;
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
     * Queue multiple audio generations
     * Each source gets its own Windmill job for parallel execution
     */
    async queueAudioGenerations(
        notebookTitle: string,
        sources: string[],
        customPrompt?: string
    ): Promise<{ queued: WindmillJobResult[]; failed: WindmillJobResult[] }> {
        const queued: WindmillJobResult[] = [];
        const failed: WindmillJobResult[] = [];

        for (const source of sources) {
            const result = await this.triggerAudioGeneration({
                notebookTitle,
                sourceTitle: source,
                customPrompt
            });

            if (result.success) {
                queued.push({ ...result, error: source }); // Reuse error field for source name
            } else {
                failed.push({ ...result, error: `${source}: ${result.error}` });
            }
        }

        return { queued, failed };
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
