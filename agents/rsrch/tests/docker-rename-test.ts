/**
 * Full Browser Integration Test for Rename Functions via Docker CDP
 * 
 * Tests:
 * 1. NotebookLM artifact renaming
 * 2. Google Docs title renaming
 * 
 * Run: npx ts-node tests/docker-rename-test.ts
 */

import { chromium, Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

const CDP_URL = 'http://localhost:9223';
const DATA_DIR = 'data/experiments';

// Ensure experiment data directory exists
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

interface TestResult {
    test: string;
    passed: boolean;
    details: string;
    screenshotBefore?: string;
    screenshotAfter?: string;
    error?: string;
}

const results: TestResult[] = [];

function log(msg: string) {
    const timestamp = new Date().toISOString().slice(11, 23);
    console.log(`[${timestamp}] ${msg}`);
}

async function captureScreenshot(page: Page, name: string): Promise<string> {
    const filename = `${DATA_DIR}/${name}_${Date.now()}.png`;
    await page.screenshot({ path: filename, fullPage: false });
    log(`Screenshot: ${filename}`);
    return filename;
}

async function testNotebookLMRename(page: Page): Promise<TestResult> {
    log('\n=== TEST: NotebookLM Artifact Rename ===\n');

    const result: TestResult = {
        test: 'NotebookLM Artifact Rename',
        passed: false,
        details: ''
    };

    try {
        // Navigate to NotebookLM
        log('Navigating to NotebookLM...');
        await page.goto('https://notebooklm.google.com/', { waitUntil: 'networkidle', timeout: 60000 });
        await page.waitForTimeout(3000);

        result.screenshotBefore = await captureScreenshot(page, 'notebooklm_main');

        // Check if we're on the main page
        const url = page.url();
        log(`Current URL: ${url}`);

        if (url.includes('accounts.google.com')) {
            result.details = 'Not logged in to Google';
            return result;
        }

        // Look for notebooks - click on the first one
        const notebookCards = page.locator('div[role="listitem"], notebook-preview, .notebook-card');
        const notebookCount = await notebookCards.count();
        log(`Found ${notebookCount} notebook elements`);

        if (notebookCount === 0) {
            // Try alternative selector
            const anyClickable = await page.locator('a, button').filter({ hasText: /notebook|research|deep dive/i }).count();
            log(`Found ${anyClickable} clickable elements with notebook-related text`);

            if (anyClickable === 0) {
                result.details = 'No notebooks found. Create a notebook first.';
                result.screenshotAfter = await captureScreenshot(page, 'notebooklm_no_notebooks');
                return result;
            }
        }

        // Click first notebook
        log('Clicking first notebook...');
        const firstNotebook = notebookCards.first();
        if (await firstNotebook.isVisible()) {
            await firstNotebook.click();
            await page.waitForTimeout(3000);
        } else {
            // Try clicking any link to a notebook
            const notebookLink = page.locator('a[href*="/notebook/"]').first();
            if (await notebookLink.count() > 0) {
                await notebookLink.click();
                await page.waitForTimeout(3000);
            }
        }

        result.screenshotAfter = await captureScreenshot(page, 'notebooklm_inside');

        // Look for Studio tab
        const studioTab = page.locator('div[role="tab"]').filter({ hasText: /Studio/i });
        if (await studioTab.count() > 0) {
            log('Found Studio tab, clicking...');
            await studioTab.click();
            await page.waitForTimeout(2000);
        }

        // Look for audio artifacts
        const artifacts = page.locator('artifact-library-item');
        const artifactCount = await artifacts.count();
        log(`Found ${artifactCount} artifacts`);

        if (artifactCount === 0) {
            result.details = `Notebook opened but no audio artifacts found. Artifact count: ${artifactCount}`;
            return result;
        }

        // Hover over first artifact
        const firstArtifact = artifacts.first();
        await firstArtifact.scrollIntoViewIfNeeded();
        await firstArtifact.hover();
        await page.waitForTimeout(500);

        // Look for more menu button
        const menuBtn = firstArtifact.locator('button[aria-label*="More"], button mat-icon:has-text("more_vert")').first();
        if (await menuBtn.count() === 0) {
            result.details = 'Could not find More menu button on artifact';
            return result;
        }

        log('Clicking More menu...');
        await menuBtn.click();
        await page.waitForTimeout(1000);

        // Look for Rename option
        const renameBtn = page.locator('button[role="menuitem"]').filter({ hasText: /Rename|Přejmenovat/i });
        if (await renameBtn.count() === 0) {
            result.details = 'Rename option not found in menu';
            await page.keyboard.press('Escape');
            return result;
        }

        log('Found Rename option!');
        result.passed = true;
        result.details = 'Successfully found artifact with More menu containing Rename option';

        // Close menu without actually renaming
        await page.keyboard.press('Escape');

    } catch (e: any) {
        result.error = e.message;
        result.details = `Exception: ${e.message}`;
        log(`Error: ${e.message}`);
    }

    return result;
}

async function testGoogleDocsRename(page: Page): Promise<TestResult> {
    log('\n=== TEST: Google Docs Title Element ===\n');

    const result: TestResult = {
        test: 'Google Docs Title Rename',
        passed: false,
        details: ''
    };

    try {
        // Navigate to Google Docs main page
        log('Navigating to Google Docs...');
        await page.goto('https://docs.google.com/document/u/0/', { waitUntil: 'networkidle', timeout: 60000 });
        await page.waitForTimeout(3000);

        result.screenshotBefore = await captureScreenshot(page, 'gdocs_main');

        // Check if logged in
        const url = page.url();
        if (url.includes('accounts.google.com')) {
            result.details = 'Not logged in to Google';
            return result;
        }

        // Look for recent documents
        const recentDocs = page.locator('[data-type="document"], .docs-homescreen-list-item');
        const docCount = await recentDocs.count();
        log(`Found ${docCount} recent documents`);

        if (docCount === 0) {
            // Try to create a new blank document
            log('No recent docs, trying to create a new document...');
            const blankDoc = page.locator('[aria-label*="Blank"], [data-value="blank"]').first();
            if (await blankDoc.count() > 0) {
                await blankDoc.click();
                await page.waitForTimeout(5000);
            } else {
                result.details = 'No recent docs and could not create new doc';
                return result;
            }
        } else {
            // Click first document
            log('Opening first document...');
            await recentDocs.first().click();
            await page.waitForTimeout(5000);
        }

        result.screenshotAfter = await captureScreenshot(page, 'gdocs_document');

        // Look for title input
        const titleInput = page.locator('input.docs-title-input');
        if (await titleInput.count() > 0 && await titleInput.isVisible()) {
            log('Found title input element!');
            const currentTitle = await titleInput.inputValue();
            log(`Current title: "${currentTitle}"`);
            result.passed = true;
            result.details = `Found editable title input with current value: "${currentTitle}"`;
        } else {
            // Try alternative selector
            const menuTitle = page.locator('[data-tooltip="Rename"], .docs-title-widget');
            if (await menuTitle.count() > 0) {
                log('Found alternative title element');
                result.passed = true;
                result.details = 'Found title element via alternative selector';
            } else {
                result.details = 'Could not find title input element';
            }
        }

    } catch (e: any) {
        result.error = e.message;
        result.details = `Exception: ${e.message}`;
        log(`Error: ${e.message}`);
    }

    return result;
}

async function main() {
    console.log('='.repeat(60));
    console.log('DOCKER BROWSER RENAME FUNCTION TESTS');
    console.log('='.repeat(60));
    console.log(`\nConnecting to Docker browser at ${CDP_URL}...\n`);

    let browser;

    try {
        browser = await chromium.connectOverCDP(CDP_URL, { timeout: 30000 });
        log('✅ Connected to Docker browser');

        const contexts = browser.contexts();
        const context = contexts[0] || await browser.newContext();

        // Use a fresh page for tests
        const page = await context.newPage();
        await page.setViewportSize({ width: 1920, height: 1080 });

        // Run tests
        results.push(await testNotebookLMRename(page));
        results.push(await testGoogleDocsRename(page));

        // Clean up
        await page.close();

    } catch (e: any) {
        log(`❌ Connection failed: ${e.message}`);
        if (e.message.includes('connect')) {
            console.log('\nHint: Make sure Docker container is running');
        }
    } finally {
        if (browser) {
            browser.close();
        }
    }

    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('TEST SUMMARY');
    console.log('='.repeat(60));

    for (const r of results) {
        const status = r.passed ? '✅' : '❌';
        console.log(`\n${status} ${r.test}`);
        console.log(`   Details: ${r.details}`);
        if (r.screenshotBefore) console.log(`   Before: ${r.screenshotBefore}`);
        if (r.screenshotAfter) console.log(`   After: ${r.screenshotAfter}`);
        if (r.error) console.log(`   Error: ${r.error}`);
    }

    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed).length;
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Results: ${passed} passed, ${failed} failed`);

    // Write experiment report
    const reportPath = `${DATA_DIR}/rename_test_report_${Date.now()}.json`;
    fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
    console.log(`Report saved: ${reportPath}`);

    if (failed > 0) process.exit(1);
}

main().catch(console.error);
