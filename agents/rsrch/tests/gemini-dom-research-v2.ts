/**
 * DOM Research Script - Direct Navigation
 * 
 * Navigates directly to a known research session URL.
 * 
 * Run: npx ts-node tests/gemini-dom-research-v2.ts
 */

import { chromium } from 'playwright';
import * as fs from 'fs';

const CDP_URL = 'http://localhost:9223';
const OUTPUT_DIR = 'data/dom-research';

// Known research session from user's browser
const RESEARCH_URL = 'https://gemini.google.com/app/c492b1aa3ca79d07';

async function main() {
    console.log('='.repeat(60));
    console.log('GEMINI DOM RESEARCH v2 - Direct Navigation');
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

        // Navigate directly to research session
        console.log(`\n[2] Navigating to research session: ${RESEARCH_URL}`);
        await page.goto(RESEARCH_URL, { waitUntil: 'networkidle', timeout: 60000 });
        await page.waitForTimeout(5000);

        // Screenshot initial view
        await page.screenshot({ path: `${OUTPUT_DIR}/v2_01_initial.png` });
        console.log('📸 v2_01_initial.png');

        // Check for immersive panel
        console.log('\n[3] Checking for immersive panel...');
        const immersiveOpen = await page.locator('.immersives-open').count();
        console.log(`Immersive panel open: ${immersiveOpen > 0}`);

        // Analyze page structure
        console.log('\n[4] Analyzing page structure...');
        const structure = await page.evaluate(() => {
            const result: any = {};

            // Find all major containers
            result.containers = Array.from(document.querySelectorAll('div.container')).map(el => ({
                classes: el.className,
                childrenCount: el.children.length,
                textLength: (el.textContent || '').length
            }));

            // Find model-response elements
            result.modelResponses = document.querySelectorAll('model-response').length;

            // Find immersive elements
            result.immersiveElements = Array.from(document.querySelectorAll('[class*="immersive"]')).map(el => ({
                tag: el.tagName,
                classes: el.className
            }));

            // Find research panel
            result.researchPanels = Array.from(document.querySelectorAll('[class*="research"]')).map(el => ({
                tag: el.tagName,
                classes: el.className
            }));

            // Find buttons with source-like labels
            result.sourceButtons = Array.from(document.querySelectorAll('button')).filter(btn => {
                const label = btn.getAttribute('aria-label') || '';
                return label.includes('informace') || label.includes('source') || label.includes('zdroj');
            }).map(btn => ({
                ariaLabel: btn.getAttribute('aria-label'),
                outerHTML: btn.outerHTML.substring(0, 300)
            }));

            // Get all headings
            result.headings = Array.from(document.querySelectorAll('h1, h2, h3')).map(h => ({
                tag: h.tagName,
                text: (h.textContent || '').substring(0, 100)
            }));

            return result;
        });

        console.log(`Containers: ${structure.containers.length}`);
        console.log(`Model responses: ${structure.modelResponses}`);
        console.log(`Immersive elements: ${structure.immersiveElements.length}`);
        console.log(`Research panels: ${structure.researchPanels.length}`);
        console.log(`Source buttons: ${structure.sourceButtons.length}`);
        console.log(`Headings: ${structure.headings.length}`);

        fs.writeFileSync(`${OUTPUT_DIR}/v2_structure.json`, JSON.stringify(structure, null, 2));
        console.log('📄 v2_structure.json');

        // If no immersive panel, try to find and click research result
        if (structure.immersiveElements.length === 0) {
            console.log('\n[5] Looking for research result to click...');

            // Look for research chip or result element
            const chipSelectors = [
                '[class*="deep-research"]',
                '[class*="research-chip"]',
                '.research-result',
                'button[aria-label*="výzkum"]',
                'button[aria-label*="research"]',
                '[data-test-id*="research"]'
            ];

            for (const sel of chipSelectors) {
                const count = await page.locator(sel).count();
                if (count > 0) {
                    console.log(`Found element with selector: ${sel}`);
                    await page.locator(sel).first().click();
                    await page.waitForTimeout(3000);
                    await page.screenshot({ path: `${OUTPUT_DIR}/v2_02_after_click.png` });
                    console.log('📸 v2_02_after_click.png');
                    break;
                }
            }
        }

        // Try to find the source info buttons more specifically
        console.log('\n[6] Looking for source footnotes...');
        const footnotes = await page.evaluate(() => {
            // Look for superscript references or small buttons within content
            const buttons = Array.from(document.querySelectorAll('button'));
            const sourceButtons = buttons.filter(btn => {
                const label = btn.getAttribute('aria-label') || '';
                const hasInfoIcon = btn.querySelector('mat-icon, .material-icons');
                return label.includes('informace') || label.includes('Další') || hasInfoIcon;
            });

            return sourceButtons.map(btn => ({
                ariaLabel: btn.getAttribute('aria-label'),
                innerText: btn.textContent?.trim(),
                parentText: btn.parentElement?.textContent?.substring(0, 100),
                boundingRect: btn.getBoundingClientRect()
            }));
        });
        console.log(`Found ${footnotes.length} potential footnote buttons`);
        fs.writeFileSync(`${OUTPUT_DIR}/v2_footnotes.json`, JSON.stringify(footnotes, null, 2));

        // Click first footnote if found
        if (footnotes.length > 0) {
            console.log('\n[7] Clicking first footnote...');
            const btn = page.locator('button[aria-label*="informace"], button[aria-label*="Další"]').first();
            if (await btn.count() > 0) {
                await btn.click();
                await page.waitForTimeout(2000);
                await page.screenshot({ path: `${OUTPUT_DIR}/v2_03_footnote_clicked.png` });
                console.log('📸 v2_03_footnote_clicked.png');

                // Capture popover/tooltip content
                const tooltips = await page.evaluate(() => {
                    const tooltipElements = document.querySelectorAll('[role="tooltip"], [role="dialog"], .mdc-tooltip, [class*="tooltip"], [class*="popover"]');
                    return Array.from(tooltipElements).map(t => ({
                        role: t.getAttribute('role'),
                        classes: t.className,
                        innerHTML: t.innerHTML.substring(0, 500),
                        links: Array.from(t.querySelectorAll('a[href]')).map(a => ({
                            href: a.getAttribute('href'),
                            text: a.textContent
                        }))
                    }));
                });
                console.log(`Tooltips found: ${tooltips.length}`);
                fs.writeFileSync(`${OUTPUT_DIR}/v2_tooltips.json`, JSON.stringify(tooltips, null, 2));

                await page.keyboard.press('Escape');
            }
        }

        // Final HTML dump
        console.log('\n[8] Dumping HTML...');
        const html = await page.content();
        fs.writeFileSync(`${OUTPUT_DIR}/v2_page_dump.html`, html);
        console.log(`📄 v2_page_dump.html (${(html.length / 1024).toFixed(0)} KB)`);

        await page.screenshot({ path: `${OUTPUT_DIR}/v2_04_final.png`, fullPage: true });
        console.log('📸 v2_04_final.png');

        console.log('\n' + '='.repeat(60));
        console.log('RESEARCH COMPLETE');
        console.log('='.repeat(60));

    } catch (e: any) {
        console.error('❌ Error:', e.message);
    } finally {
        if (browser) browser.close();
    }
}

main().catch(console.error);
