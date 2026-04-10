import { z } from 'zod';

export const McpRequestSchema = z.object({
    id: z.string(),
    tool: z.string(),
    method: z.string(),
    params: z.any(),
    timestamp: z.number(),
});

export const McpResponseSchema = z.object({
    id: z.string(),
    result: z.any().optional(),
    error: z.string().optional(),
    timestamp: z.number(),
});

export type McpRequest = z.infer<typeof McpRequestSchema>;
export type McpResponse = z.infer<typeof McpResponseSchema>;
