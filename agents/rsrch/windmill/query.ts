
/**
 * Windmill Script: Execute Rsrch Query
 *
 * This script is executed by the Windmill Worker (blocking).
 * It connects to the Rsrch Chromium via CDP and executes the query.
 * 
 * Called by submit.ts asynchronously. Use poll.ts to check results.
 * 
 * It relies on the pre-built 'rsrch' package in ../dist
 */

import { PerplexityClient } from '../../dist/client';
import { config } from '../../dist/config';
import * as path from 'path';
import * as dns from 'node:dns';

// Windmill entrypoint
export async function main(
    query: string,
    deep_research: boolean = false,
    cdp_endpoint: string = 'http://chromium:9223', // 'chromium' service in rsrch compose, or host linkage
    session_id?: string
) {
    console.log(`🚀 Starting Rsrch Query: "${query.substring(0, 50)}..."`);

    // Set Environment Variables for Config
    // We assume the worker has /w/agents mounted.
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

    try {
        await client.init({ keepAlive: false });

        // Execute Query
        const results = await client.query(query, {
            deepResearch: deep_research,
            sessionId: session_id
        });

        return {
            success: true,
            ...results
        };

    } catch (error) {
        console.error('❌ Query failed:', error);
        throw error;
    } finally {
        await client.close();
    }
}
