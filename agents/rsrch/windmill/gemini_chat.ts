
/**
 * Windmill Script: Execute Gemini Chat
 *
 * This script is executed by the Windmill Worker (blocking).
 * It connects to the Rsrch Chromium via CDP and executes the Gemini message.
 */

import { PerplexityClient } from '../../dist/client';
import { GeminiClient } from '../../dist/gemini-client';
import * as dns from 'node:dns';

// Windmill entrypoint
export async function main(
    message: string,
    session_id?: string,
    wait_for_response: boolean = true,
    cdp_endpoint: string = 'http://chromium:9223'
) {
    console.log(`🚀 Starting Gemini Chat: "${message.substring(0, 50)}..." (Session: ${session_id || 'new'})`);

    // Set Environment Variables for Config
    process.env.RESULTS_DIR = '/w/agents/rsrch/results';
    process.env.AUTH_FILE = '/w/agents/rsrch/auth.json';

    // DNS Resolution for CDP
    let finalEndpoint = cdp_endpoint;
    try {
        const url = new URL(cdp_endpoint);
        if (url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
            const { address } = await dns.promises.lookup(url.hostname);
            url.hostname = address;
            finalEndpoint = url.origin;
            console.log(`  🔍 Resolved CDP endpoint to IP: ${address}`);
        }
    } catch (e) {
        console.warn('  ⚠️ DNS lookup failed, using original endpoint:', e);
    }

    process.env.BROWSER_CDP_ENDPOINT = finalEndpoint;

    const client = new PerplexityClient();
    let geminiClient: GeminiClient | null = null;

    try {
        await client.init({ keepAlive: false });
        geminiClient = await client.createGeminiClient();
        await geminiClient.init();

        if (session_id) {
            await geminiClient.openSession(session_id);
        }

        const response = await geminiClient.sendMessage(message, {
            waitForResponse: wait_for_response
        });

        const finalSessionId = geminiClient.getCurrentSessionId();

        return {
            success: true,
            response,
            session_id: finalSessionId
        };

    } catch (error: any) {
        console.error('❌ Gemini Chat failed:', error);
        return {
            success: false,
            error: error.message
        };
    } finally {
        await client.close();
    }
}
