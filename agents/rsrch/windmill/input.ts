/**
 * Windmill Script: Input (Submit Query)
 * 
 * PHASE 1 of the Input/Output pattern.
 * 
 * This script:
 * 1. Acquires the human lock (ensures one input at a time)
 * 2. Finds or creates a tab
 * 3. Types the query with human-like delays
 * 4. Injects a MutationObserver that calls a webhook when done
 * 5. Disconnects immediately (frees the worker)
 * 
 * The output.ts script is triggered by the webhook when the response is ready.
 */

import { chromium } from 'playwright';
import { withHumanHands, humanType } from '../../shared/human-lock';
import { getTab, markTabBusy, ServiceType } from '../../shared/tab-pool';

// Windmill webhook URL for the output script
// This should be configured as a Windmill resource or environment variable
const OUTPUT_WEBHOOK_URL = process.env.WINDMILL_OUTPUT_WEBHOOK || 'http://windmill-server:8000/api/w/main/jobs/run_wait_result/p/f/rsrch/output';

// CDP endpoint
const CDP_ENDPOINT = process.env.BROWSER_CDP_ENDPOINT || 'http://rsrch-chromium:9223';

/**
 * Resolve hostname to IP for CDP connection (bypasses Host header issues)
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
 * Inject a MutationObserver that watches for query completion
 * and calls the webhook when done.
 */
async function injectCompletionObserver(
    page: any,
    tabId: string,
    webhookUrl: string,
    query: string
): Promise<void> {
    await page.evaluate(({ webhookUrl, tabId, query }) => {
        // Selector for the response container (adjust based on actual Perplexity DOM)
        const responseSelector = '.prose, [data-testid="response"], .answer-container';

        // Track if we've already fired the webhook
        let webhookFired = false;

        // Function to check if generation is complete
        const checkCompletion = () => {
            // Look for signs of completion:
            // 1. "Copy" button appears
            // 2. Streaming indicator disappears
            // 3. Response text stops changing
            const copyButton = document.querySelector('button[aria-label="Copy"], button:has-text("Copy")');
            const streamingIndicator = document.querySelector('.cursor-blink, .typing-indicator, [data-streaming="true"]');

            return copyButton !== null || streamingIndicator === null;
        };

        // Create observer
        const observer = new MutationObserver((mutations) => {
            if (webhookFired) return;

            // Check if generation is complete
            if (checkCompletion()) {
                webhookFired = true;
                observer.disconnect();

                console.log('[Observer] Generation complete, calling webhook...');

                // Call the Windmill webhook
                fetch(webhookUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        tabId: tabId,
                        query: query,
                        timestamp: Date.now(),
                        status: 'ready'
                    })
                }).then(() => {
                    console.log('[Observer] Webhook called successfully');
                }).catch((error) => {
                    console.error('[Observer] Webhook failed:', error);
                });
            }
        });

        // Start observing
        const targetNode = document.body;
        observer.observe(targetNode, {
            childList: true,
            subtree: true,
            characterData: true
        });

        // Fallback: if nothing happens in 5 minutes, fire webhook anyway
        setTimeout(() => {
            if (!webhookFired) {
                webhookFired = true;
                observer.disconnect();

                fetch(webhookUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        tabId: tabId,
                        query: query,
                        timestamp: Date.now(),
                        status: 'timeout'
                    })
                });
            }
        }, 5 * 60 * 1000);

    }, { webhookUrl, tabId, query });
}

/**
 * Main entry point for Windmill
 */
export async function main(
    query: string,
    deep_research: boolean = false,
    session_id?: string,
    webhook_url?: string
): Promise<{ tabId: string; status: string }> {

    const resolvedEndpoint = await resolveCdpEndpoint(CDP_ENDPOINT);
    const browser = await chromium.connectOverCDP(resolvedEndpoint);

    try {
        // Get a tab (finds free one or creates new)
        const page = await getTab(browser, 'perplexity' as ServiceType, session_id);

        // Mark the tab as busy and get its ID
        const tabId = await markTabBusy(page);

        // Acquire human lock and perform input actions
        await withHumanHands(async () => {
            // Bring tab to front (human behavior)
            await page.bringToFront();

            // Find the input textarea
            const textarea = page.locator('textarea').first();
            await textarea.waitFor({ state: 'visible', timeout: 10000 });

            // Click to focus
            await textarea.click();

            // Type with human-like delays
            await humanType(page, query);

            // If deep research is requested, look for the toggle
            if (deep_research) {
                const deepToggle = page.locator('button:has-text("Deep"), label:has-text("Deep Research")').first();
                if (await deepToggle.isVisible({ timeout: 2000 }).catch(() => false)) {
                    await deepToggle.click();
                }
            }

            // Submit
            await page.keyboard.press('Enter');
        });

        // Inject the completion observer (this is fast, no lock needed)
        const effectiveWebhookUrl = webhook_url || OUTPUT_WEBHOOK_URL;
        await injectCompletionObserver(page, tabId, effectiveWebhookUrl, query);

        console.log(`📤 Query submitted, tabId: ${tabId}`);
        console.log(`⏳ Waiting for webhook callback to: ${effectiveWebhookUrl}`);

        // Disconnect (leave browser and tab running)
        await browser.close();

        return {
            tabId: tabId,
            status: 'submitted'
        };

    } catch (error: any) {
        await browser.close();
        throw error;
    }
}
