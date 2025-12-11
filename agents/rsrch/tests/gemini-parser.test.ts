/**
 * Test script for Gemini Research Parser
 * 
 * Connects to Docker browser and tests parseResearch on an existing session.
 * 
 * Run: npx ts-node tests/gemini-parser.test.ts
 */

import { chromium, Page } from 'playwright';
import { GeminiClient } from '../src/gemini-client';
import * as fs from 'fs';

const CDP_URL = 'http://localhost:9223';
const OUTPUT_DIR = 'data/experiments';

async function main() {
    console.log('='.repeat(60));
    console.log('GEMINI RESEARCH PARSER TEST');
    console.log('='.repeat(60));

    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    let browser;

    try {
        console.log('\n[1] Connecting to Docker browser...');
        browser = await chromium.connectOverCDP(CDP_URL, { timeout: 30000 });
        console.log('✅ Connected');

        const contexts = browser.contexts();
        const context = contexts[0] || await browser.newContext();
        const page = await context.newPage();
        await page.setViewportSize({ width: 1920, height: 1080 });

        console.log('\n[2] Navigating to Gemini...');
        await page.goto('https://gemini.google.com/app', { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(3000);

        // Check if logged in
        const url = page.url();
        if (url.includes('accounts.google.com')) {
            console.log('❌ Not logged in to Google');
            return;
        }
        console.log('✅ Logged in');

        console.log('\n[3] Opening sidebar to find research sessions...');
        const menuBtn = page.locator('button[aria-label*="Hlavní nabídka"], button[aria-label*="Main menu"]').first();
        if (await menuBtn.count() > 0) {
            await menuBtn.click();
            await page.waitForTimeout(2000);
        }

        // Find and click a research session
        console.log('\n[4] Looking for research sessions...');
        const chatItems = page.locator('a[href*="/app/"], .conversation');
        const chatCount = await chatItems.count();
        console.log(`Found ${chatCount} chat items`);

        // Try to find a research-like title
        let foundResearch = false;
        for (let i = 0; i < Math.min(chatCount, 10); i++) {
            const item = chatItems.nth(i);
            const text = await item.textContent();
            if (text && (text.includes('Deep') || text.includes('Research') || text.includes('🔬') || text.includes('Dive'))) {
                console.log(`Found research session: "${text.substring(0, 50)}..."`);
                await item.click();
                await page.waitForTimeout(3000);
                foundResearch = true;
                break;
            }
        }

        if (!foundResearch) {
            console.log('No research session found, using current page');
        }

        // Take screenshot
        const screenshotPath = `${OUTPUT_DIR}/gemini_parser_test_${Date.now()}.png`;
        await page.screenshot({ path: screenshotPath });
        console.log(`Screenshot: ${screenshotPath}`);

        console.log('\n[5] Creating GeminiClient and parsing research...');
        const gemini = new GeminiClient(page);

        const parsed = await gemini.parseResearch();

        if (!parsed) {
            console.log('❌ Failed to parse research');
            return;
        }

        console.log('\n[6] Parse Results:');
        console.log(`  Title: ${parsed.title}`);
        console.log(`  Query: ${parsed.query?.substring(0, 80)}...`);
        console.log(`  Content length: ${parsed.content.length} chars`);
        console.log(`  Headings: ${parsed.headings.length}`);
        parsed.headings.slice(0, 5).forEach(h => console.log(`    - ${h}`));
        console.log(`  Citations: ${parsed.citations.length}`);
        parsed.citations.slice(0, 5).forEach(c => console.log(`    - ${c.domain}: ${c.text.substring(0, 40)}`));
        console.log(`  Reasoning steps: ${parsed.reasoningSteps.length}`);
        console.log(`  Flow nodes: ${parsed.researchFlow.length}`);

        // Export to markdown
        console.log('\n[7] Exporting to Markdown...');
        const markdown = gemini.exportToMarkdown(parsed);

        const mdPath = `${OUTPUT_DIR}/parsed_research_${Date.now()}.md`;
        fs.writeFileSync(mdPath, markdown);
        console.log(`✅ Saved: ${mdPath}`);

        // Save raw parsed data
        const jsonPath = `${OUTPUT_DIR}/parsed_research_${Date.now()}.json`;
        fs.writeFileSync(jsonPath, JSON.stringify(parsed, null, 2));
        console.log(`✅ Saved: ${jsonPath}`);

        console.log('\n' + '='.repeat(60));
        console.log('TEST COMPLETE');
        console.log('='.repeat(60));

    } catch (e: any) {
        console.error('❌ Test failed:', e.message);
    } finally {
        if (browser) {
            browser.close();
        }
    }
}

main().catch(console.error);
