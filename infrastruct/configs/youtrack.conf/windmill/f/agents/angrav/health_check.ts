/**
 * Windmill Script: Antigravity Health Check
 * 
 * Checks if the Antigravity browser is accessible and responding.
 * Useful for monitoring and pre-flight checks before running prompts.
 * 
 * @returns Health status including connection state and page info
 */

import { connectToApp, getAgentFrame } from '/w/agents/angrav/src/core';

export async function main(): Promise<{
    healthy: boolean;
    connected: boolean;
    agentFrameFound: boolean;
    error?: string;
    pageTitle?: string;
}> {
    const cdpEndpoint = process.env.BROWSER_CDP_ENDPOINT || 'http://angrav-browser:9223';

    console.log(`🏥 Health check for ${cdpEndpoint}...`);

    try {
        // Resolve hostname
        let endpoint = cdpEndpoint;
        try {
            const url = new URL(cdpEndpoint);
            if (url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
                const dns = require('node:dns').promises;
                const { address } = await dns.lookup(url.hostname);
                url.hostname = address;
                endpoint = url.origin;
            }
        } catch (e) {
            // Continue with original
        }

        const { browser, page } = await connectToApp(endpoint);

        try {
            const title = await page.title();
            console.log(`  📄 Page title: ${title}`);

            let agentFrameFound = false;
            try {
                await getAgentFrame(page);
                agentFrameFound = true;
                console.log('  ✅ Agent frame found');
            } catch (e) {
                console.log('  ⚠️ Agent frame not found (may need to open Agent Manager)');
            }

            return {
                healthy: true,
                connected: true,
                agentFrameFound,
                pageTitle: title
            };
        } finally {
            await browser.close();
        }
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error(`❌ Health check failed: ${errorMsg}`);

        return {
            healthy: false,
            connected: false,
            agentFrameFound: false,
            error: errorMsg
        };
    }
}
