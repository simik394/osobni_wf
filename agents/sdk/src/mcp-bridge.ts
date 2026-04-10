import * as fs from 'fs-extra';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';

const BRIDGE_DIR = path.resolve(process.cwd(), '.jules/mcp');
const REQUESTS_DIR = path.join(BRIDGE_DIR, 'requests');
const RESPONSES_DIR = path.join(BRIDGE_DIR, 'responses');

import { McpRequestSchema, McpResponseSchema, McpRequest, McpResponse } from './types';

export class McpBridge {
    constructor() {
        this.ensureDirectories();
    }

    private ensureDirectories() {
        fs.ensureDirSync(REQUESTS_DIR);
        fs.ensureDirSync(RESPONSES_DIR);
    }

    /**
     * Calls an MCP tool via the signal bridge.
     */
    async callTool(tool: string, method: string, params: any = {}, timeoutMs: number = 30000): Promise<any> {
        const id = uuidv4();
        const request: McpRequest = {
            id,
            tool,
            method,
            params,
            timestamp: Date.now(),
        };

        const requestPath = path.join(REQUESTS_DIR, `${id}.json`);
        const responsePath = path.join(RESPONSES_DIR, `${id}.json`);

        // 1. Write the request
        await fs.writeJson(requestPath, request);

        // 2. Poll for the response
        const startTime = Date.now();
        while (Date.now() - startTime < timeoutMs) {
            if (await fs.pathExists(responsePath)) {
                try {
                    const rawResponse = await fs.readJson(responsePath);
                    const response = McpResponseSchema.parse(rawResponse);

                    // Cleanup
                    await fs.remove(requestPath);
                    await fs.remove(responsePath);

                    if (response.error) {
                        throw new Error(`MCP Error [${tool}:${method}]: ${response.error}`);
                    }
                    return response.result;
                } catch (err) {
                    console.error(`Invalid response format for ${id}:`, err);
                    // Continue polling if parsing failed (it might be partially written)
                }
            }
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        // Cleanup on timeout
        await fs.remove(requestPath).catch(() => {});
        throw new Error(`MCP Timeout: No response for ${tool}:${method} after ${timeoutMs}ms`);
    }
}
