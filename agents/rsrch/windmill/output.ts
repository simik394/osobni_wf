/**
 * Windmill Script: Output (Scrape Result)
 * 
 * PHASE 2 of the Input/Output pattern.
 * 
 * This script is triggered by the webhook from input.ts when generation is complete.
 * 
 * It:
 * 1. Connects to the browser
 * 2. Finds the tab by ID
 * 3. Scrapes the result
 * 4. Recycles the tab for future use
 * 5. Returns the result
 */

import { chromium } from 'playwright';
import { findTabById, markTabFree, recycleTab } from '../../shared/tab-pool';

// CDP endpoint
const CDP_ENDPOINT = process.env.BROWSER_CDP_ENDPOINT || 'http://rsrch-chromium:9223';

/**
 * Resolve hostname to IP for CDP connection
 */
async function resolveCdpEndpoint(endpoint: string): Promise<string> {
    const url = new URL(endpoint);

    if (url.hostname !== 'localhost' && !url.hostname.match(/^\d+\.\d+\.\d+\.\d+$/)) {
        const dns = await import('node:dns');
        const { promisify } = await import('node:util');
        const lookup = promisify(dns.lookup);

        try {
            const { address } = await lookup(url.hostname);
            url.hostname = address;
            return url.toString();
        } catch {
            return endpoint;
        }
    }

    return endpoint;
}

/**
 * Extract the response content from the Perplexity page
 */
async function extractResponse(page: any): Promise<{
    answer: string;
    sources: string[];
    relatedQuestions: string[];
}> {
    return await page.evaluate(() => {
        // Main answer text
        const answerEl = document.querySelector('.prose, [data-testid="response"], .answer-container');
        const answer = answerEl?.textContent?.trim() || '';

        // Sources/citations
        const sourceEls = document.querySelectorAll('a[data-testid="source"], .citation-link, a[href^="http"]');
        const sources: string[] = [];
        sourceEls.forEach((el) => {
            const href = el.getAttribute('href');
            if (href && !sources.includes(href)) {
                sources.push(href);
            }
        });

        // Related questions
        const relatedEls = document.querySelectorAll('[data-testid="related-question"], .related-question');
        const relatedQuestions: string[] = [];
        relatedEls.forEach((el) => {
            const text = el.textContent?.trim();
            if (text) relatedQuestions.push(text);
        });

        return { answer, sources, relatedQuestions };
    });
}

/**
 * Main entry point for Windmill
 * 
 * Called by the webhook from input.ts
 */
export async function main(
    tabId: string,
    query: string,
    status: string,
    timestamp: number,
    recycle_tab: boolean = true
): Promise<{
    status: 'success' | 'timeout' | 'error';
    query: string;
    answer: string;
    sources: string[];
    relatedQuestions: string[];
    processingTimeMs: number;
}> {

    const startTime = Date.now();
    const resolvedEndpoint = await resolveCdpEndpoint(CDP_ENDPOINT);
    const browser = await chromium.connectOverCDP(resolvedEndpoint);

    try {
        // Find the tab by ID
        const page = await findTabById(browser, tabId);

        if (!page) {
            throw new Error(`Tab with ID ${tabId} not found`);
        }

        console.log(`📥 Found tab ${tabId}, extracting response...`);

        // Extract the response
        const response = await extractResponse(page);

        // Calculate processing time
        const processingTimeMs = Date.now() - timestamp;

        console.log(`✅ Response extracted (${response.answer.length} chars, ${response.sources.length} sources)`);

        // Recycle the tab for future use
        if (recycle_tab) {
            await recycleTab(page, 'perplexity');
        } else {
            await markTabFree(page);
        }

        // Disconnect (leave browser running)
        await browser.close();

        return {
            status: status === 'timeout' ? 'timeout' : 'success',
            query: query,
            answer: response.answer,
            sources: response.sources,
            relatedQuestions: response.relatedQuestions,
            processingTimeMs: processingTimeMs
        };

    } catch (error: any) {
        await browser.close();

        return {
            status: 'error',
            query: query,
            answer: error.message,
            sources: [],
            relatedQuestions: [],
            processingTimeMs: Date.now() - startTime
        };
    }
}
