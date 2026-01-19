// Windmill Script: publish_jules_sessions
// Publishes selected Jules sessions as PRs via browser automation
// Connects to existing browser via CDP for authenticated session
// 
// Usage: Pass array of session IDs to publish
// Mode: 'pr' (default) or 'branch'

interface PublishRequest {
    session_ids: string[];
    mode?: 'pr' | 'branch';
    slow_motion_ms?: number;  // Add delay between actions for anti-detection
}

interface SessionResult {
    session_id: string;
    success: boolean;
    pr_url?: string;
    error?: string;
}

interface PublishResult {
    success: boolean;
    total: number;
    published: number;
    skipped: number;
    failed: number;
    results: SessionResult[];
}

export async function main(args: PublishRequest): Promise<PublishResult> {
    const {
        session_ids,
        mode = 'pr',
        slow_motion_ms = 150  // Slight delay for natural-looking interaction
    } = args;

    const results: SessionResult[] = [];
    const CDP_ENDPOINT = Deno.env.get("CDP_ENDPOINT") || "http://localhost:9222";

    // Import puppeteer-core (Windmill Deno)
    const puppeteer = await import("npm:puppeteer-core@23.4.0");

    let browser: any = null;

    try {
        // 1. Get browser WebSocket endpoint
        console.log(`Connecting to browser at ${CDP_ENDPOINT}...`);
        const versionResponse = await fetch(`${CDP_ENDPOINT}/json/version`);
        if (!versionResponse.ok) {
            throw new Error(`Cannot reach browser CDP at ${CDP_ENDPOINT}`);
        }
        const versionInfo = await versionResponse.json();
        const wsEndpoint = versionInfo.webSocketDebuggerUrl;

        // 2. Connect to browser
        browser = await puppeteer.default.connect({
            browserWSEndpoint: wsEndpoint,
            defaultViewport: null
        });
        console.log(`Connected to browser`);

        // 3. Process each session
        for (const sessionId of session_ids) {
            console.log(`\nProcessing session: ${sessionId}`);

            try {
                const result = await publishSession(browser, sessionId, mode, slow_motion_ms);
                results.push(result);

                // Small delay between sessions for natural pacing
                await sleep(slow_motion_ms * 3);

            } catch (err) {
                console.error(`Error publishing ${sessionId}:`, err);
                results.push({
                    session_id: sessionId,
                    success: false,
                    error: String(err)
                });
            }
        }

    } catch (error) {
        console.error("Browser connection error:", error);
        // Return partial results if we have any
        if (results.length === 0) {
            return {
                success: false,
                total: session_ids.length,
                published: 0,
                skipped: 0,
                failed: session_ids.length,
                results: session_ids.map(id => ({
                    session_id: id,
                    success: false,
                    error: String(error)
                }))
            };
        }
    } finally {
        // Disconnect (don't close - we're reusing existing browser)
        if (browser) {
            await browser.disconnect();
        }
    }

    const published = results.filter(r => r.success && r.pr_url).length;
    const skipped = results.filter(r => r.success && !r.pr_url).length;
    const failed = results.filter(r => !r.success).length;

    return {
        success: failed === 0,
        total: session_ids.length,
        published,
        skipped,
        failed,
        results
    };
}

async function publishSession(
    browser: any,
    sessionId: string,
    mode: 'pr' | 'branch',
    slowMotion: number
): Promise<SessionResult> {

    const page = await browser.newPage();

    try {
        // Navigate to session
        const sessionUrl = `https://jules.google.com/session/${sessionId}`;
        console.log(`  Navigating to ${sessionUrl}`);

        await page.goto(sessionUrl, {
            waitUntil: 'networkidle2',
            timeout: 30000
        });

        // Wait for page to fully render
        await sleep(2000 + slowMotion);

        // Check if already published (has PR link)
        const existingPR = await page.$('a[href*="github.com"][href*="/pull/"]');
        if (existingPR) {
            const prUrl = await existingPR.evaluate((el: any) => el.href);
            console.log(`  Already published: ${prUrl}`);
            await page.close();
            return {
                session_id: sessionId,
                success: true,
                pr_url: prUrl,
                error: 'Already published'
            };
        }

        // Look for Publish button - try multiple selectors
        const publishSelectors = [
            'button:has-text("Publish branch")',
            'button:has-text("Publish PR")',
            'button:has-text("Publish")',
            'button[aria-label*="Publish"]',
            '.publish-button'
        ];

        let publishButton = null;
        for (const selector of publishSelectors) {
            try {
                publishButton = await page.$(selector);
                if (publishButton) break;
            } catch { }
        }

        // Also try XPath for text matching
        if (!publishButton) {
            const buttons = await page.$$('button');
            for (const btn of buttons) {
                const text = await btn.evaluate((el: any) => el.textContent);
                if (text && text.includes('Publish')) {
                    publishButton = btn;
                    break;
                }
            }
        }

        if (!publishButton) {
            // Check session state
            const pageContent = await page.content();
            if (pageContent.includes('inactive') || pageContent.includes('failed')) {
                await page.close();
                return {
                    session_id: sessionId,
                    success: false,
                    error: 'Session is inactive or failed - cannot publish'
                };
            }
            if (pageContent.includes('In progress')) {
                await page.close();
                return {
                    session_id: sessionId,
                    success: false,
                    error: 'Session still in progress - wait for completion'
                };
            }
            await page.close();
            return {
                session_id: sessionId,
                success: false,
                error: 'No Publish button found'
            };
        }

        console.log(`  Found Publish button, clicking...`);

        // Find and click dropdown to select PR mode
        const dropdownTrigger = await page.$('button.cdk-menu-trigger.button-dropdown');
        if (dropdownTrigger && mode === 'pr') {
            await sleep(slowMotion);
            await dropdownTrigger.click();
            await sleep(slowMotion * 2);

            // Click "Publish PR" option
            const prOption = await page.$('button:has-text("Publish PR")');
            if (prOption) {
                await prOption.click();
                await sleep(slowMotion);
            }
        }

        // Click main publish button
        await sleep(slowMotion);
        await publishButton.click();
        await sleep(2000);

        // Wait for and confirm any dialog
        const confirmButtons = [
            'button:has-text("Confirm")',
            'button:has-text("Submit")',
            'button:has-text("Create")'
        ];

        for (const selector of confirmButtons) {
            try {
                const confirmBtn = await page.$(selector);
                if (confirmBtn) {
                    await confirmBtn.click();
                    await sleep(2000);
                    break;
                }
            } catch { }
        }

        // Wait for PR creation (up to 15 seconds)
        console.log(`  Waiting for PR creation...`);
        let prUrl: string | undefined;

        for (let i = 0; i < 15; i++) {
            await sleep(1000);

            // Check for success message or PR link
            const successEl = await page.$('a[href*="github.com"][href*="/pull/"]');
            if (successEl) {
                prUrl = await successEl.evaluate((el: any) => el.href);
                console.log(`  PR created: ${prUrl}`);
                break;
            }

            // Check for "View PR" button
            const viewPRBtn = await page.$('button:has-text("View PR")');
            if (viewPRBtn) {
                await viewPRBtn.click();
                await sleep(500);
                // Get PR URL from new tab
                const pages = await browser.pages();
                const prPage = pages.find((p: any) => p.url().includes('github.com/') && p.url().includes('/pull/'));
                if (prPage) {
                    prUrl = prPage.url();
                }
                break;
            }
        }

        await page.close();

        if (prUrl) {
            return {
                session_id: sessionId,
                success: true,
                pr_url: prUrl
            };
        } else {
            return {
                session_id: sessionId,
                success: true,
                error: 'Published but could not retrieve PR URL'
            };
        }

    } catch (error) {
        await page.close().catch(() => { });
        throw error;
    }
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}
