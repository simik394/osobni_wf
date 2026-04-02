"use strict";
// @ts-nocheck
/**
 * Shared DOM Observer Utility
 *
 * Provides a universal interface for injecting MutationObservers into browser tabs
 * to monitor asynchronous tasks (generation, uploads, etc.) without blocking the worker.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.injectSharedObserver = injectSharedObserver;
/**
 * Injects a MutationObserver into the page that watches for task completion.
 * When criteria are met, it triggers a webhook and/or resolves a promise.
 */
async function injectSharedObserver(page, options) {
    const { tabId, webhookUrl, completionCriteria, timeoutMs = 600000, metadata = {} } = options;
    await page.evaluate(({ tabId, webhookUrl, criteria, timeoutMs, metadata }) => {
        let fired = false;
        const checkCompletion = () => {
            // Check for appearances
            if (criteria.appears) {
                for (const selector of criteria.appears) {
                    if (document.querySelector(selector))
                        return { status: 'success', signal: `appeared: ${selector}` };
                }
            }
            // Check for disappearances
            if (criteria.disappears) {
                for (const selector of criteria.disappears) {
                    if (!document.querySelector(selector))
                        return { status: 'success', signal: `disappeared: ${selector}` };
                }
            }
            // Check for text matches
            if (criteria.textMatches) {
                const regex = new RegExp(criteria.textMatches, 'i');
                if (regex.test(document.body.innerText))
                    return { status: 'success', signal: 'text matched' };
            }
            return null;
        };
        const observer = new MutationObserver(() => {
            if (fired)
                return;
            const result = checkCompletion();
            if (result) {
                fired = true;
                observer.disconnect();
                console.log(`[SharedObserver] Task complete (${result.signal}), tabId: ${tabId}`);
                if (webhookUrl) {
                    fetch(webhookUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            tabId,
                            status: result.status,
                            signal: result.signal,
                            metadata,
                            timestamp: Date.now()
                        })
                    }).catch(err => console.error('[SharedObserver] Webhook failed:', err));
                }
            }
        });
        // Start observing
        observer.observe(document.body, {
            childList: true,
            subtree: true,
            characterData: true,
            attributes: true
        });
        // Timeout fallback
        setTimeout(() => {
            if (!fired) {
                fired = true;
                observer.disconnect();
                console.warn(`[SharedObserver] Timeout after ${timeoutMs}ms, tabId: ${tabId}`);
                if (webhookUrl) {
                    fetch(webhookUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            tabId,
                            status: 'timeout',
                            timestamp: Date.now()
                        })
                    }).catch(err => console.error('[SharedObserver] Timeout webhook failed:', err));
                }
            }
        }, timeoutMs);
    }, { tabId, webhookUrl, criteria: completionCriteria, timeoutMs, metadata });
}
