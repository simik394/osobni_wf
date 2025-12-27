/**
 * Windmill Script: Perplexity Query
 * 
 * Sends a query to Perplexity AI via rsrch agent.
 * Good for current events and web-sourced information.
 * 
 * @param query The search query
 * @param sessionId Optional session ID to continue a conversation
 * @returns Query results with answer and sources
 */

import { PerplexityClient } from '/w/agents/rsrch/src/client';

export async function main(
    query: string,
    sessionId?: string
): Promise<{
    success: boolean;
    answer?: string;
    sources?: Array<{ title: string; url: string }>;
    error?: string;
    durationMs: number;
}> {
    const startTime = Date.now();

    console.log(`🔍 Perplexity Query: "${query.substring(0, 50)}..."`);
    if (sessionId) {
        console.log(`  Continuing session: ${sessionId}`);
    }

    try {
        const client = new PerplexityClient();

        console.log('🚀 Initializing Perplexity client...');
        await client.init();

        console.log('📤 Sending query...');
        const result = await client.query(query, { sessionId });

        await client.close();

        const durationMs = Date.now() - startTime;
        console.log(`✅ Completed in ${durationMs}ms`);
        console.log(`  Answer length: ${result.answer?.length || 0} chars`);

        return {
            success: true,
            answer: result.answer,
            sources: result.sources,
            durationMs
        };
    } catch (error) {
        const durationMs = Date.now() - startTime;
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error(`❌ Failed: ${errorMsg}`);

        return {
            success: false,
            error: errorMsg,
            durationMs
        };
    }
}
