/**
 * Windmill Script: Send Prompt to Antigravity
 * 
 * Sends a prompt to the Antigravity agent via CDP and returns the response.
 * This script can be triggered from Windmill UI, scheduled, or via API.
 * 
 * @param prompt The message to send to the agent
 * @param timeout Maximum time to wait for response (ms), default 120000
 * @returns The agent's response
 */

// Windmill will resolve these imports from the mounted volume
import { connectToApp, getAgentFrame } from '/w/agents/angrav/src/core';
import { sendPrompt } from '/w/agents/angrav/src/prompt';
import { waitForIdle } from '/w/agents/angrav/src/state';
import { extractResponse } from '/w/agents/angrav/src/extraction';

export async function main(
    prompt: string,
    timeout: number = 120000
): Promise<{
    success: boolean;
    response?: string;
    codeBlocks?: Array<{ language: string; content: string }>;
    error?: string;
    durationMs: number;
}> {
    const startTime = Date.now();

    // Get CDP endpoint from Windmill variable or default
    const cdpEndpoint = process.env.BROWSER_CDP_ENDPOINT || 'http://angrav-browser:9223';

    console.log(`🚀 Connecting to Antigravity at ${cdpEndpoint}...`);

    try {
        // Resolve hostname to IP for Docker networking
        let endpoint = cdpEndpoint;
        try {
            const url = new URL(cdpEndpoint);
            if (url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
                const dns = require('node:dns').promises;
                const { address } = await dns.lookup(url.hostname);
                url.hostname = address;
                endpoint = url.origin;
                console.log(`  🔍 Resolved to ${address}`);
            }
        } catch (e) {
            console.warn('  ⚠️ DNS resolution failed, using original');
        }

        const { browser, page } = await connectToApp(endpoint);

        try {
            const frame = await getAgentFrame(page);

            console.log(`📤 Sending prompt (${prompt.length} chars)...`);
            await sendPrompt(frame, page, prompt, { wait: false });

            console.log(`⏳ Waiting for response (timeout: ${timeout}ms)...`);
            await waitForIdle(frame, timeout);

            console.log('📥 Extracting response...');
            const result = await extractResponse(frame);

            const durationMs = Date.now() - startTime;
            console.log(`✅ Completed in ${durationMs}ms`);

            return {
                success: true,
                response: result.fullText,
                codeBlocks: result.codeBlocks,
                durationMs
            };
        } finally {
            await browser.close();
        }
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
