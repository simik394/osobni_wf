/**
 * Deep Research Document Parser - Full Flow
 * 
 * 1. Navigate to research session
 * 2. Find and click "Otevřít" (Open) button to open research document
 * 3. Extract full document content from immersive view
 * 
 * Run: npx ts-node tests/gemini-open-research-doc.ts
 */

import { chromium, Page } from 'playwright';
import * as fs from 'fs';

const CDP_URL = 'http://localhost:9223';
const OUTPUT_DIR = 'data/experiments';
const SESSION_ID = 'c492b1aa3ca79d07';

async function main() {
    console.log('='.repeat(60));
    console.log('OPEN AND PARSE DEEP RESEARCH DOCUMENT');
    console.log('='.repeat(60));

    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    let browser;

    try {
        console.log('\n[1] Connecting to Docker browser...');
        browser = await chromium.connectOverCDP(CDP_URL, { timeout: 30000 });
        console.log('✅ Connected');

        const context = browser.contexts()[0] || await browser.newContext();
        const page = await context.newPage();
        await page.setViewportSize({ width: 1920, height: 1080 });

        // Navigate to research session
        console.log(`\n[2] Navigating to session: ${SESSION_ID}`);
        await page.goto(`https://gemini.google.com/app/${SESSION_ID}`, {
            waitUntil: 'networkidle',
            timeout: 60000
        });
        await page.waitForTimeout(4000);

        // Look for "Otevřít" button and click it
        console.log('\n[3] Looking for "Otevřít" (Open) button...');
        const openButton = page.locator('button:has-text("Otevřít"), button:has-text("Open")').first();

        if (await openButton.count() > 0) {
            console.log('Found Open button, clicking...');
            await openButton.click();
            await page.waitForTimeout(3000);
            console.log('✅ Clicked Open button');
        } else {
            console.log('⚠️ No Open button found');
        }

        // Take screenshot after opening
        await page.screenshot({ path: `${OUTPUT_DIR}/deep_research_opened.png` });
        console.log('📸 deep_research_opened.png');

        // Wait for the document to load
        await page.waitForTimeout(2000);

        // Now extract the document content
        console.log('\n[4] Extracting research document content...');

        // The research document should now be in an immersive panel
        // Look for the main content area that's NOT the chat
        const docContent = await page.evaluate(() => {
            // Look for the research document container
            // It should be a large container that's NOT inside model-response
            const containers = document.querySelectorAll('.content-wrapper, .immersive-container, [class*="document"], [class*="research"]');
            let bestContainer = null;
            let maxLen = 0;

            containers.forEach(c => {
                // Skip if inside model-response (that's chat)
                if (c.closest('model-response')) return;

                const len = (c.textContent || '').length;
                if (len > maxLen) {
                    maxLen = len;
                    bestContainer = c;
                }
            });

            // Try specific selectors for the research document
            const docSelectors = [
                '.research-document',
                '.deep-research-content',
                '.immersive-content',
                'article',
                '[role="article"]',
                '.document-content'
            ];

            for (const sel of docSelectors) {
                const el = document.querySelector(sel);
                if (el && (el.textContent || '').length > maxLen) {
                    bestContainer = el;
                    maxLen = (el.textContent || '').length;
                }
            }

            if (!bestContainer) {
                // Last resort: get all text from the immersive panel
                const immersive = document.querySelector('.immersives-mode, .immersives-open');
                if (immersive) {
                    bestContainer = immersive;
                    maxLen = (immersive.textContent || '').length;
                }
            }

            if (bestContainer) {
                // Extract headings
                const headings = Array.from(bestContainer.querySelectorAll('h1, h2, h3')).map(h => ({
                    level: h.tagName,
                    text: h.textContent?.trim()
                }));

                // Extract content
                const content = (bestContainer as HTMLElement).innerText || bestContainer.textContent || '';

                // Extract HTML for markdown conversion
                const html = (bestContainer as HTMLElement).innerHTML;

                return {
                    length: content.length,
                    headings: headings.slice(0, 30),
                    preview: content.substring(0, 500),
                    containerClass: (bestContainer as Element).className
                };
            }

            return null;
        });

        if (docContent) {
            console.log(`Found document: ${docContent.length} chars`);
            console.log(`Container: ${docContent.containerClass?.substring(0, 60)}...`);
            console.log(`Headings: ${docContent.headings.length}`);
            if (docContent.headings.length > 0) {
                console.log('First 5 headings:');
                docContent.headings.slice(0, 5).forEach((h: any) => {
                    console.log(`  ${h.level}: ${h.text?.substring(0, 50)}`);
                });
            }
            console.log(`Preview:\n${docContent.preview}...`);
        } else {
            console.log('❌ Could not find document content');
        }

        // Take final screenshot
        await page.screenshot({ path: `${OUTPUT_DIR}/deep_research_final.png`, fullPage: true });
        console.log('📸 deep_research_final.png');

        // Save the page state for analysis
        const currentUrl = page.url();
        console.log(`\nCurrent URL: ${currentUrl}`);

        console.log('\n' + '='.repeat(60));
        console.log('EXTRACTION COMPLETE');
        console.log('='.repeat(60));

    } catch (e: any) {
        console.error('❌ Error:', e.message);
    } finally {
        if (browser) browser.close();
    }
}

main().catch(console.error);
