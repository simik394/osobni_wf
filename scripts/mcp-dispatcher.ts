import * as fs from 'fs-extra';
import * as path from 'path';
import { McpRequestSchema, McpResponseSchema, McpRequest, McpResponse } from '../agents/sdk/src/types';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const BRIDGE_DIR = path.resolve(process.cwd(), '.jules/mcp');
const REQUESTS_DIR = path.join(BRIDGE_DIR, 'requests');
const RESPONSES_DIR = path.join(BRIDGE_DIR, 'responses');

async function main() {
    console.log('Starting MCP Dispatcher (SSE Mode)...');
    
    const transport = new StreamableHTTPClientTransport(
        new URL('https://napoveda.youtrack.cloud/mcp'),
        {
            requestInit: {
                headers: {
                    'Authorization': 'Bearer perm-cm9vdA==.NDctNQ==.F2hpDGTxhHNG8idMuoFGhz16WgP0mM',
                    'Content-Type': 'application/json'
                }
            }
        }
    );

    const client = new Client({
        name: 'Jules-Bridge-Dispatcher',
        version: '1.0.0'
    }, {
        capabilities: {}
    });

    await client.connect(transport);
    console.log('Connected to MCP server.');

    fs.ensureDirSync(REQUESTS_DIR);
    fs.ensureDirSync(RESPONSES_DIR);

    console.log('Monitoring requests...');
    
    while (true) {
        const files = await fs.readdir(REQUESTS_DIR);
        for (const file of files) {
            if (file.endsWith('.json')) {
                const requestPath = path.join(REQUESTS_DIR, file);
                const id = path.basename(file, '.json');
                const responsePath = path.join(RESPONSES_DIR, `${id}.json`);

                if (await fs.pathExists(responsePath)) continue;

                try {
                    const rawRequest = await fs.readJson(requestPath);
                    const request = McpRequestSchema.parse(rawRequest);
                    
                    console.log(`[${id}] Calling ${request.tool}:${request.method}...`);
                    
                    const result = await client.callTool({
                        name: request.method,
                        arguments: request.params
                    });

                    let toolResult = result.content?.[0]?.text || result;
                    
                    // Try to parse JSON if it's a string
                    if (typeof toolResult === 'string') {
                        try {
                            toolResult = JSON.parse(toolResult);
                        } catch (e) {
                            // Leave as string if not valid JSON
                        }
                    }

                    const response: McpResponse = {
                        id,
                        result: toolResult,
                        timestamp: Date.now()
                    };

                    await fs.writeJson(responsePath, response);
                    console.log(`[${id}] Success.`);
                } catch (err: any) {
                    console.error(`[${id}] Error:`, err);
                    const errorResponse: McpResponse = {
                        id,
                        error: err.message,
                        timestamp: Date.now()
                    };
                    await fs.writeJson(responsePath, errorResponse);
                }
            }
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
}

main().catch(console.error);
