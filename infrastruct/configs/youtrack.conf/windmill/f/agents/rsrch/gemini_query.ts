/**
 * Windmill Script: Gemini Research Query
 * 
 * Sends a research query to Gemini via rsrch agent.
 * Supports both quick queries and deep research mode.
 * 
 * @param query The research question
 * @param model Model to use (default: gemini-rsrch)
 * @param deepResearch Enable deep research mode (longer, more thorough)
 * @returns Research results including answer and sources
 */

import { GeminiClient, GeminiResearchResult } from '/w/agents/rsrch/src/gemini-client';

export async function main(
    query: string,
    model: string = 'gemini-rsrch',
    deepResearch: boolean = false
): Promise<{
    success: boolean;
    result?: GeminiResearchResult;
    error?: string;
    durationMs: number;
}> {
    const startTime = Date.now();

    console.log(`🔬 Gemini Research: "${query.substring(0, 50)}..."`);
    console.log(`  Model: ${model}, DeepResearch: ${deepResearch}`);

    try {
        const client = new GeminiClient();

        console.log('🚀 Initializing Gemini client...');
        await client.init();

        console.log('📤 Sending query...');
        const result = await client.research(query, { deepResearch });

        await client.close();

        const durationMs = Date.now() - startTime;
        console.log(`✅ Completed in ${durationMs}ms`);
        console.log(`  Answer length: ${result.answer?.length || 0} chars`);
        console.log(`  Sources: ${result.sources?.length || 0}`);

        return {
            success: true,
            result,
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
