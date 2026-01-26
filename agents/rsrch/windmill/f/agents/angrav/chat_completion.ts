/**
 * Windmill Script: angrav Chat Completion
 * 
 * OpenAI-compatible chat completion endpoint for angrav (Antigravity) agent.
 * This script is called by the proxy layer to serialize browser interactions.
 * 
 * @param messages Array of chat messages
 * @param model Model to use (gemini-antigravity)
 * @param stream Whether to stream (not supported in Windmill, will be ignored)
 * @param session Optional session name/ID for targeting specific Antigravity session
 * @returns OpenAI-compatible chat completion response
 */

// Windmill uses Deno runtime
declare const Deno: { env: { get(key: string): string | undefined } };

export async function main(
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    model: string = 'gemini-antigravity',
    stream: boolean = false,
    session?: string
): Promise<{
    id: string;
    object: 'chat.completion';
    created: number;
    model: string;
    choices: Array<{
        index: number;
        message: { role: 'assistant'; content: string };
        finish_reason: 'stop' | 'length' | 'error';
    }>;
    usage: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
    session?: string;
}> {
    // Get angrav internal endpoint from Windmill resource
    // Windmill uses Deno runtime, so use Deno.env
    const ANGRAV_INTERNAL_URL = Deno.env.get('ANGRAV_INTERNAL_URL') || 'http://localhost:13031';

    console.log(`📨 Chat Completion via Windmill (angrav)`);
    console.log(`  Model: ${model}`);
    console.log(`  Messages: ${messages.length}`);
    console.log(`  Session: ${session || 'auto'}`);

    // Stream is not supported when going through Windmill (job-based execution)
    if (stream) {
        console.warn('⚠️ Streaming not supported via Windmill, falling back to non-streaming');
    }

    const startTime = Date.now();

    try {
        const response = await fetch(`${ANGRAV_INTERNAL_URL}/v1/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Bypass-Windmill': 'true' // Bypass proxy on internal call
            },
            body: JSON.stringify({
                model,
                messages,
                stream: false, // Force non-streaming
                session
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`angrav API error: ${response.status} ${errorText}`);
        }

        const result = await response.json();
        const durationMs = Date.now() - startTime;

        console.log(`✅ Completed in ${durationMs}ms`);
        console.log(`  Response length: ${result.choices?.[0]?.message?.content?.length || 0} chars`);
        console.log(`  Session used: ${result.session || 'unknown'}`);

        return result;
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error(`❌ Failed: ${errorMsg}`);

        // Return error in OpenAI-compatible format
        return {
            id: 'chatcmpl-error',
            object: 'chat.completion',
            created: Math.floor(Date.now() / 1000),
            model,
            choices: [{
                index: 0,
                message: {
                    role: 'assistant',
                    content: `[ERROR: ${errorMsg}]`
                },
                finish_reason: 'error'
            }],
            usage: {
                prompt_tokens: 0,
                completion_tokens: 0,
                total_tokens: 0
            }
        };
    }
}
