/**
 * Deep Research Document Parser - DOM Exploration
 * 
 * Looking for the actual research document (immersive panel),
 * NOT the chat conversation history.
 * 
 * Run: npx ts-node tests/gemini-deep-research-dom.ts
 */

import { chromium } from 'playwright';
import * as fs from 'fs';

const CDP_URL = 'http://localhost:9223';
const OUTPUT_DIR = 'data/dom-research';
const SESSION_ID = 'c492b1aa3ca79d07';

async function main() {
    console.log('='.repeat(60));
    console.log('DEEP RESEARCH DOCUMENT EXPLORATION');
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
        console.log(`\n[2] Navigating to: ${SESSION_ID}`);
        await page.goto(`https://gemini.google.com/app/${SESSION_ID}`, {
            waitUntil: 'networkidle',
            timeout: 60000
        });
        await page.waitForTimeout(5000);

        // Screenshot initial state
        await page.screenshot({ path: `${OUTPUT_DIR}/deep_01_initial.png` });
        console.log('📸 deep_01_initial.png');

        // Check for immersive mode
        console.log('\n[3] Checking for immersive panel...');
        const immersiveMode = await page.locator('.immersives-mode').count();
        const immersiveOpen = await page.locator('.immersives-open').count();
        console.log(`  immersives-mode: ${immersiveMode > 0}`);
        console.log(`  immersives-open: ${immersiveOpen > 0}`);

        // Look for research document container
        console.log('\n[4] Looking for research document elements...');
        const researchDocInfo = await page.evaluate(() => {
            const result: any = {};

            // Find the immersive panel container
            const immersivePanel = document.querySelector('.ng-tns-c2898995979-1.immersives-mode');
            if (immersivePanel) {
                result.immersivePanel = {
                    classList: immersivePanel.className,
                    childrenCount: immersivePanel.children.length,
                    textLength: (immersivePanel.textContent || '').length
                };
            }

            // Look for deep-research-view or similar
            const deepResearch = document.querySelector('[class*="deep-research"], [class*="research-doc"], [class*="research-view"]');
            if (deepResearch) {
                result.deepResearch = {
                    classList: deepResearch.className,
                    textLength: (deepResearch.textContent || '').length
                };
            }

            // Find the right-side panel that contains the actual document
            const panels = document.querySelectorAll('[class*="panel"], [class*="side"], [class*="immersive"]');
            result.panels = Array.from(panels).slice(0, 5).map(p => ({
                tag: p.tagName,
                classes: p.className.split(' ').slice(0, 3).join(' '),
                textLen: (p.textContent || '').length
            }));

            // Look for content that's NOT in model-response (chat)
            // The actual research doc might be in a separate container
            const allContainers = document.querySelectorAll('div');
            const largeContainers = Array.from(allContainers).filter(d => {
                const text = d.textContent || '';
                const hasResearchContent = text.includes('Srovnání') || text.includes('Kitty') || text.includes('analýza');
                return text.length > 5000 && hasResearchContent;
            });

            result.largeContainers = largeContainers.slice(0, 3).map(c => ({
                classes: c.className,
                textLength: (c.textContent || '').length,
                isModelResponse: c.closest('model-response') !== null,
                firstHeading: c.querySelector('h1, h2')?.textContent?.substring(0, 50)
            }));

            return result;
        });

        console.log('Research doc info:', JSON.stringify(researchDocInfo, null, 2));
        fs.writeFileSync(`${OUTPUT_DIR}/deep_research_structure.json`, JSON.stringify(researchDocInfo, null, 2));

        // Try to find and click the "View full research" or expand button
        console.log('\n[5] Looking for expand/view buttons...');
        const expandButtons = await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('button'));
            return buttons
                .filter(b => {
                    const text = (b.textContent || '').toLowerCase();
                    const label = (b.getAttribute('aria-label') || '').toLowerCase();
                    return text.includes('view') || text.includes('expand') ||
                        text.includes('zobrazit') || text.includes('otevřít') ||
                        label.includes('view') || label.includes('expand');
                })
                .map(b => ({
                    text: b.textContent?.trim().substring(0, 50),
                    ariaLabel: b.getAttribute('aria-label'),
                    classes: b.className.split(' ').slice(0, 3).join(' ')
                }));
        });
        console.log(`Found ${expandButtons.length} potential expand buttons`);
        fs.writeFileSync(`${OUTPUT_DIR}/expand_buttons.json`, JSON.stringify(expandButtons, null, 2));

        // Look specifically for the research result "chip" or card
        console.log('\n[6] Looking for research result card...');
        const chips = await page.evaluate(() => {
            // Find elements that look like clickable research results
            const elements = document.querySelectorAll('[class*="chip"], [class*="card"], [class*="result"], [class*="research"]');
            return Array.from(elements).slice(0, 10).map(el => ({
                tag: el.tagName,
                classes: el.className.split(' ').slice(0, 4).join(' '),
                text: (el.textContent || '').substring(0, 100),
                isClickable: el.hasAttribute('role') || el.tagName === 'BUTTON' || el.hasAttribute('tabindex')
            }));
        });
        console.log(`Found ${chips.length} chip/card elements`);

        // Take a full-page screenshot
        await page.screenshot({ path: `${OUTPUT_DIR}/deep_02_fullpage.png`, fullPage: true });
        console.log('📸 deep_02_fullpage.png');

        // Dump the HTML of just the immersive panel area if found
        const immersiveHtml = await page.evaluate(() => {
            const panel = document.querySelector('[class*="immersives-mode"]');
            return panel ? panel.outerHTML : null;
        });

        if (immersiveHtml) {
            fs.writeFileSync(`${OUTPUT_DIR}/immersive_panel.html`, immersiveHtml);
            console.log(`📄 immersive_panel.html (${(immersiveHtml.length / 1024).toFixed(0)} KB)`);
        }

        console.log('\n' + '='.repeat(60));
        console.log('EXPLORATION COMPLETE');
        console.log('='.repeat(60));

    } catch (e: any) {
        console.error('❌ Error:', e.message);
    } finally {
        if (browser) browser.close();
    }
}

main().catch(console.error);
