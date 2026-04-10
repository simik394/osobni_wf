"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.McpBridge = void 0;
const fs = __importStar(require("fs-extra"));
const path = __importStar(require("path"));
const uuid_1 = require("uuid");
const BRIDGE_DIR = path.resolve(process.cwd(), '.jules/mcp');
const REQUESTS_DIR = path.join(BRIDGE_DIR, 'requests');
const RESPONSES_DIR = path.join(BRIDGE_DIR, 'responses');
const types_1 = require("./types");
class McpBridge {
    constructor() {
        this.ensureDirectories();
    }
    ensureDirectories() {
        fs.ensureDirSync(REQUESTS_DIR);
        fs.ensureDirSync(RESPONSES_DIR);
    }
    /**
     * Calls an MCP tool via the signal bridge.
     */
    async callTool(tool, method, params = {}, timeoutMs = 30000) {
        const id = (0, uuid_1.v4)();
        const request = {
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
                    const response = types_1.McpResponseSchema.parse(rawResponse);
                    // Cleanup
                    await fs.remove(requestPath);
                    await fs.remove(responsePath);
                    if (response.error) {
                        throw new Error(`MCP Error [${tool}:${method}]: ${response.error}`);
                    }
                    return response.result;
                }
                catch (err) {
                    console.error(`Invalid response format for ${id}:`, err);
                    // Continue polling if parsing failed (it might be partially written)
                }
            }
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        // Cleanup on timeout
        await fs.remove(requestPath).catch(() => { });
        throw new Error(`MCP Timeout: No response for ${tool}:${method} after ${timeoutMs}ms`);
    }
}
exports.McpBridge = McpBridge;
