/**
 * Warmup Script - Pre-load Tabs at Container Start
 * 
 * Run this script when the browser container starts to pre-load tabs
 * for faster first-job execution.
 * 
 * Usage:
 *   - In supervisord.conf or entrypoint.sh:
 *     node /app/warmup.js
 *   - Or as a Windmill script triggered on deployment
 */

import { chromium } from 'playwright';
import { markTabFree, SERVICE_URLS, ServiceType } from './tab-pool';

// Configuration
const CDP_ENDPOINT = process.env.BROWSER_CDP_ENDPOINT || 'http://localhost:9222';

// Which services to pre-load and how many tabs each
const WARMUP_CONFIG: { service: ServiceType; count: number }[] = [
    { service: 'perplexity', count: 2 },
    // Add more services as needed:
    // { service: 'gemini', count: 1 },
];

async function resolveCdpEndpoint(endpoint: string): Promise<string> {
    // If endpoint contains a hostname (not localhost/IP), resolve it
    const url = new URL(endpoint);

    if (url.hostname !== 'localhost' && !url.hostname.match(/^\d+\.\d+\.\d+\.\d+$/)) {
        const dns = await import('node:dns');
        const { promisify } = await import('node:util');
        const lookup = promisify(dns.lookup);

        try {
            const { address } = await lookup(url.hostname);
            url.hostname = address;
            console.log(`🔍 Resolved ${endpoint} to ${url.toString()}`);
            return url.toString();
        } catch (error) {
            console.warn(`⚠️ Could not resolve hostname, using original: ${endpoint}`);
            return endpoint;
        }
    }

    return endpoint;
}

export async function warmup(): Promise<void> {
    console.log('🔥 Starting browser warmup...');

    const resolvedEndpoint = await resolveCdpEndpoint(CDP_ENDPOINT);

    const browser = await chromium.connectOverCDP(resolvedEndpoint);
    const context = browser.contexts()[0] || await browser.newContext();

    for (const { service, count } of WARMUP_CONFIG) {
        const serviceUrl = SERVICE_URLS[service];
        console.log(`📂 Pre-loading ${count} tab(s) for ${service}...`);

        for (let i = 0; i < count; i++) {
            try {
                const page = await context.newPage();
                await page.goto(serviceUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
                await markTabFree(page);
                console.log(`  ✅ Tab ${i + 1}/${count} ready: ${serviceUrl}`);
            } catch (error) {
                console.error(`  ❌ Failed to load tab for ${service}:`, error);
            }
        }
    }

    // Disconnect but leave browser and tabs running
    await browser.close();

    console.log('🔥 Warmup complete! All tabs are ready.');
}

// Run if executed directly
if (require.main === module) {
    warmup()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error('Warmup failed:', error);
            process.exit(1);
        });
}
