
import axios, { AxiosInstance } from 'axios';
import { readFileSync, existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

export interface WindmillConfig {
    baseUrl: string;
    token: string;
    workspace: string;
}

export class WindmillClient {
    private axios: AxiosInstance;
    private config: WindmillConfig;

    constructor(customConfig?: Partial<WindmillConfig>) {
        this.config = this.loadConfig(customConfig);
        this.axios = axios.create({
            baseURL: this.config.baseUrl,
            headers: {
                'Authorization': `Bearer ${this.config.token}`,
                'Content-Type': 'application/json',
            },
        });
    }

    private loadConfig(custom?: Partial<WindmillConfig>): WindmillConfig {
        // 1. Try generic auth.json
        const authPath = join(homedir(), '.gemini', 'auth.json');
        let fileConfig: any = {};
        if (existsSync(authPath)) {
            try {
                const content = JSON.parse(readFileSync(authPath, 'utf8'));
                // Assume structure { windmill: { token: "..." } }
                if (content.windmill) {
                    fileConfig = content.windmill;
                }
            } catch (e) {
                console.warn("Failed to read auth.json", e);
            }
        }

        return {
            baseUrl: custom?.baseUrl || process.env.WINDMILL_URL || "http://halvarm:3030", // Fallback to internal address
            token: custom?.token || process.env.WINDMILL_TOKEN || fileConfig.token || "",
            workspace: custom?.workspace || process.env.WINDMILL_WORKSPACE || "rsrch",
        };
    }

    async executeJob(path: string, args: Record<string, any>, wait: boolean = true) {
        // /w/<workspace>/jobs/run/f/<path>
        const endpoint = `/w/${this.config.workspace}/jobs/run/f/${path}`;
        try {
            console.log(`[Windmill] Dispatching to ${this.config.baseUrl}${endpoint}...`);
            const res = await this.axios.post(endpoint, args);
            const jobId = res.data;

            if (wait) {
                // Poll for result
                return this.waitForJob(jobId);
            }
            return jobId;
        } catch (error: any) {
            throw new Error(`Windmill execution failed: ${error.message} (${error.response?.data})`);
        }
    }

    private async waitForJob(jobId: string) {
        // Polling logic
        const maxRetries = 60; // 1 minute approx
        for (let i = 0; i < maxRetries; i++) {
            await new Promise(r => setTimeout(r, 1000));
            const res = await this.axios.get(`/w/${this.config.workspace}/jobs/${jobId}/result`);
            if (res.data && res.data.completed) {
                if (res.data.success) {
                    return res.data.result;
                } else {
                    throw new Error(`Job failed: ${res.data.error}`);
                }
            }
        }
        throw new Error("Job timed out");
    }
}
