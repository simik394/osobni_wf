/**
 * DOM Research Script for Gemini Citation Structure
 * 
 * Explores the DOM to understand:
 * 1. Immersive panel structure
 * 2. Citation button behavior
 * 3. Where URLs are hidden
 * 
 * Run: npx ts-node tests/gemini-dom-research.ts
 */

import { chromium, Page } from 'playwright';
import * as fs from 'fs';

const CDP_URL = 'http://localhost:9223';
const OUTPUT_DIR = 'data/dom-research';

async function main() {
    console.log('='.repeat(60));
    console.log('GEMINI DOM RESEARCH');
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

        // Navigate to Gemini
        console.log('\n[2] Navigating to Gemini...');
        await page.goto('https://gemini.google.com/app', { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(3000);

        // Open sidebar
        console.log('\n[3] Opening sidebar...');
        const menuBtn = page.locator('button[aria-label*="Hlavní nabídka"], button[aria-label*="Main menu"]').first();
        if (await menuBtn.count() > 0) {
            await menuBtn.click();
            await page.waitForTimeout(2000);
        }

        // Find research session URL and navigate directly
        console.log('\n[4] Finding research session...');
        let targetUrl = '';
        const links = page.locator('a[href*="/app/c"]');
        const linkCount = await links.count();

        for (let i = 0; i < Math.min(linkCount, 15); i++) {
            const link = links.nth(i);
            const text = await link.textContent();
            const href = await link.getAttribute('href');
            if (text && (text.includes('🔬') || text.includes('Deep') || text.includes('Research') || text.includes('Dive'))) {
                console.log(`Found: "${text.substring(0, 60).trim()}..."`);
                targetUrl = href || '';
                break;
            }
        }

        // Close sidebar first
        await menuBtn.click();
        await page.waitForTimeout(1000);

        // Navigate to the research session directly
        if (targetUrl) {
            const fullUrl = targetUrl.startsWith('http') ? targetUrl : `https://gemini.google.com${targetUrl}`;
            console.log(`Navigating to: ${fullUrl}`);
            await page.goto(fullUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
            await page.waitForTimeout(4000);
        } else {
            // Fall back to clicking via JavaScript
            console.log('No direct link found, trying JS click...');
            await page.evaluate(() => {
                const items = Array.from(document.querySelectorAll('[data-test-id="conversation"]'));
                for (const item of items) {
                    const text = item.textContent || '';
                    if (text.includes('🔬') || text.includes('Deep')) {
                        (item as HTMLElement).click();
                        break;
                    }
                }
            });
            await page.waitForTimeout(3000);
        }

        // Screenshot chat view
        await page.screenshot({ path: `${OUTPUT_DIR}/01_chat_view.png` });
        console.log('📸 01_chat_view.png');

        // Look for immersive panel class
        console.log('\n[5] Analyzing DOM for immersive panel...');
        const immersiveClasses = await page.evaluate(() => {
            const elements = document.querySelectorAll('[class*="immersive"], [class*="research"], [class*="container"]');
            return Array.from(elements).slice(0, 10).map(el => ({
                tag: el.tagName,
                classes: el.className,
                text: (el.textContent || '').substring(0, 100)
            }));
        });
        console.log('Immersive elements found:', immersiveClasses.length);
        fs.writeFileSync(`${OUTPUT_DIR}/immersive_elements.json`, JSON.stringify(immersiveClasses, null, 2));

        // Check if immersive view is already open
        const immersiveOpen = await page.locator('.immersives-open').count();
        console.log(`Immersive panel open: ${immersiveOpen > 0}`);

        // Try to find and click the research result chip
        console.log('\n[6] Looking for research result chip...');
        const chips = page.locator('[class*="chip"], [class*="research-item"], button[aria-label*="Výzkum"], button[aria-label*="Research"]');
        const chipCount = await chips.count();
        console.log(`Found ${chipCount} potential chips`);

        if (chipCount > 0) {
            // Click first chip
            await chips.first().click();
            await page.waitForTimeout(3000);
            await page.screenshot({ path: `${OUTPUT_DIR}/02_after_chip_click.png` });
            console.log('📸 02_after_chip_click.png');
        }

        // Now look for the main content container
        console.log('\n[7] Analyzing content container...');
        const containers = await page.evaluate(() => {
            const selectors = [
                'div.container',
                'model-response',
                '.immersive-container',
                '.research-content',
                '[data-test-id*="content"]'
            ];
            const results: any[] = [];
            selectors.forEach(sel => {
                const el = document.querySelector(sel);
                if (el) {
                    results.push({
                        selector: sel,
                        innerHTML_length: el.innerHTML.length,
                        textContent_length: (el.textContent || '').length,
                        children: el.children.length
                    });
                }
            });
            return results;
        });
        console.log('Content containers:', containers);
        fs.writeFileSync(`${OUTPUT_DIR}/containers.json`, JSON.stringify(containers, null, 2));

        // Look for citation buttons
        console.log('\n[8] Finding citation buttons...');
        const citationInfo = await page.evaluate(() => {
            const buttons = document.querySelectorAll('button[aria-label*="informace"], button[aria-label*="source"], a[href*="http"]');
            return Array.from(buttons).slice(0, 5).map(btn => ({
                tag: btn.tagName,
                ariaLabel: btn.getAttribute('aria-label'),
                href: btn.getAttribute('href'),
                title: btn.getAttribute('title'),
                innerText: (btn.textContent || '').substring(0, 50),
                outerHTML: btn.outerHTML.substring(0, 200)
            }));
        });
        console.log(`Citation elements: ${citationInfo.length}`);
        fs.writeFileSync(`${OUTPUT_DIR}/citation_buttons.json`, JSON.stringify(citationInfo, null, 2));

        // Try clicking a citation button
        if (citationInfo.length > 0) {
            console.log('\n[9] Clicking citation button...');
            const citBtn = page.locator('button[aria-label*="informace"], button[aria-label*="source"]').first();
            if (await citBtn.count() > 0) {
                await citBtn.click();
                await page.waitForTimeout(1500);
                await page.screenshot({ path: `${OUTPUT_DIR}/03_citation_clicked.png` });
                console.log('📸 03_citation_clicked.png');

                // Analyze popover
                const popoverInfo = await page.evaluate(() => {
                    const popovers = document.querySelectorAll('[role="dialog"], [role="tooltip"], [class*="popover"], [class*="tooltip"], [class*="overlay"]');
                    return Array.from(popovers).map(p => ({
                        tag: p.tagName,
                        classes: p.className,
                        role: p.getAttribute('role'),
                        innerHTML_length: p.innerHTML.length,
                        links: Array.from(p.querySelectorAll('a[href]')).map(a => ({
                            href: a.getAttribute('href'),
                            text: a.textContent
                        }))
                    }));
                });
                console.log('Popover elements:', popoverInfo.length);
                fs.writeFileSync(`${OUTPUT_DIR}/popover_info.json`, JSON.stringify(popoverInfo, null, 2));

                // Close popover
                await page.keyboard.press('Escape');
                await page.waitForTimeout(500);
            }
        }

        // Dump full HTML for analysis
        console.log('\n[10] Dumping page HTML...');
        const html = await page.content();
        fs.writeFileSync(`${OUTPUT_DIR}/page_dump.html`, html);
        console.log(`📄 page_dump.html (${(html.length / 1024).toFixed(0)} KB)`);

        // Final screenshot
        await page.screenshot({ path: `${OUTPUT_DIR}/04_final_state.png`, fullPage: true });
        console.log('📸 04_final_state.png');

        console.log('\n' + '='.repeat(60));
        console.log('RESEARCH COMPLETE');
        console.log(`Output saved to: ${OUTPUT_DIR}/`);
        console.log('='.repeat(60));

    } catch (e: any) {
        console.error('❌ Error:', e.message);
    } finally {
        if (browser) browser.close();
    }
}

main().catch(console.error);
