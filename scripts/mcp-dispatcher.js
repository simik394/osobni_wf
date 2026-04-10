import * as fs from 'fs-extra';
import * as path from 'path';
import { McpRequestSchema } from '../agents/sdk/src/types';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
const BRIDGE_DIR = path.resolve(process.cwd(), '.jules/mcp');
const REQUESTS_DIR = path.join(BRIDGE_DIR, 'requests');
const RESPONSES_DIR = path.join(BRIDGE_DIR, 'responses');
async function main() {
    console.log('Starting MCP Dispatcher...');
    // Command to launch the target MCP server (e.g. YouTrack)
    // In a real prod env, this would be configured via env or config
    const transport = new StdioClientTransport({
        command: process.env.MCP_SERVER_COMMAND || 'npx',
        args: process.env.MCP_SERVER_ARGS?.split(' ') || ['-y', 'napovedayt']
    });
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
                if (await fs.pathExists(responsePath))
                    continue;
                try {
                    const rawRequest = await fs.readJson(requestPath);
                    const request = McpRequestSchema.parse(rawRequest);
                    console.log(`[${id}] Calling ${request.tool}:${request.method}...`);
                    const result = await client.callTool({
                        name: request.method,
                        arguments: request.params
                    });
                    const response = {
                        id,
                        result: result.content?.[0]?.text || result,
                        timestamp: Date.now()
                    };
                    await fs.writeJson(responsePath, response);
                    console.log(`[${id}] Success.`);
                }
                catch (err) {
                    console.error(`[${id}] Error:`, err);
                    const errorResponse = {
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
