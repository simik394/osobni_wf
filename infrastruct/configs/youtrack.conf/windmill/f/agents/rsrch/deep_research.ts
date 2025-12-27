/**
 * Windmill Script: Deep Research Job
 * 
 * Runs a comprehensive deep research session using Gemini.
 * This is a long-running operation (5-30 minutes) that performs
 * thorough analysis with multiple iterations.
 * 
 * Ideal for:
 * - Complex research questions
 * - Multi-faceted topics
 * - When thoroughness matters more than speed
 * 
 * @param query The research question
 * @param notifyOnComplete Discord notification on completion
 * @returns Full research report with sources
 */

import { GeminiClient } from '/w/agents/rsrch/src/gemini-client';
import { getGraphStore } from '/w/agents/rsrch/src/graph-store';

export async function main(
    query: string,
    notifyOnComplete: boolean = true
): Promise<{
    success: boolean;
    jobId?: string;
    report?: {
        answer: string;
        sources: Array<{ title: string; url: string }>;
        keyFindings: string[];
    };
    error?: string;
    durationMs: number;
}> {
    const startTime = Date.now();
    const graphStore = getGraphStore();

    console.log(`📚 Deep Research: "${query.substring(0, 50)}..."`);

    // Create job record
    const job = await graphStore.addJob('deepResearch', query, {});
    console.log(`📋 Job ID: ${job.id}`);

    try {
        await graphStore.updateJobStatus(job.id, 'running');

        const client = new GeminiClient();

        console.log('🚀 Starting deep research session...');
        await client.init();

        // Deep research takes longer - 5+ minutes typically
        const result = await client.research(query, {
            deepResearch: true,
            timeout: 30 * 60 * 1000 // 30 minute timeout
        });

        await client.close();

        // Extract key findings from the answer
        const keyFindings = extractKeyFindings(result.answer || '');

        await graphStore.updateJobStatus(job.id, 'completed', { result });

        const durationMs = Date.now() - startTime;
        console.log(`✅ Deep research completed in ${Math.round(durationMs / 1000)}s`);

        // Optional Discord notification
        if (notifyOnComplete) {
            try {
                const { notifyJobCompleted } = await import('/w/agents/rsrch/src/discord');
                await notifyJobCompleted(
                    job.id,
                    'Deep Research',
                    query,
                    true,
                    result.answer?.substring(0, 200)
                );
            } catch (e) {
                console.log('⚠️ Discord notification failed (non-fatal)');
            }
        }

        return {
            success: true,
            jobId: job.id,
            report: {
                answer: result.answer || '',
                sources: result.sources || [],
                keyFindings
            },
            durationMs
        };
    } catch (error) {
        const durationMs = Date.now() - startTime;
        const errorMsg = error instanceof Error ? error.message : String(error);

        await graphStore.updateJobStatus(job.id, 'failed', { error: errorMsg });
        console.error(`❌ Deep research failed: ${errorMsg}`);

        return {
            success: false,
            jobId: job.id,
            error: errorMsg,
            durationMs
        };
    }
}

/**
 * Extract bullet-point key findings from research answer
 */
function extractKeyFindings(answer: string): string[] {
    const findings: string[] = [];

    // Look for numbered points or bullet points
    const lines = answer.split('\n');
    for (const line of lines) {
        const trimmed = line.trim();
        if (
            /^[\d]+\./.test(trimmed) || // "1. Finding"
            /^[-*•]/.test(trimmed) ||    // "- Finding" or "* Finding"
            /^Key (finding|point|takeaway)/i.test(trimmed)
        ) {
            findings.push(trimmed.replace(/^[\d]+\.\s*|^[-*•]\s*/, ''));
        }
    }

    return findings.slice(0, 10); // Top 10 findings
}
