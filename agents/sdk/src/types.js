"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.McpResponseSchema = exports.McpRequestSchema = void 0;
const zod_1 = require("zod");
exports.McpRequestSchema = zod_1.z.object({
    id: zod_1.z.string(),
    tool: zod_1.z.string(),
    method: zod_1.z.string(),
    params: zod_1.z.any(),
    timestamp: zod_1.z.number(),
});
exports.McpResponseSchema = zod_1.z.object({
    id: zod_1.z.string(),
    result: zod_1.z.any().optional(),
    error: zod_1.z.string().optional(),
    timestamp: zod_1.z.number(),
});
