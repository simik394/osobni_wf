/**
 * Test parser with thought-item extraction
 * Run: npx ts-node tests/test-parser-fix.ts
 */

import { chromium } from 'playwright';
import { GeminiClient } from '../src/gemini-client';
import * as fs from 'fs';

const CDP_URL = 'http://localhost:9223';
const SESSION_ID = 'c492b1aa3ca79d07';

async function main() {
    console.log('='.repeat(60));
    console.log('PARSER FIX TEST - thought-item extraction');
    console.log('='.repeat(60));

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
        await page.goto('https://gemini.google.com/app', { waitUntil: 'networkidle', timeout: 60000 });
        await page.waitForTimeout(3000);

        // Create client and parse
        console.log('\n[3] Creating GeminiClient and parsing...');
        const geminiClient = new GeminiClient(page);

        const parsed = await geminiClient.parseResearch(SESSION_ID);

        if (parsed) {
            console.log('\n[4] RESULTS:');
            console.log(`  Title: ${parsed.title}`);
            console.log(`  Content length: ${parsed.content.length} chars`);
            console.log(`  Headings: ${parsed.headings.length}`);

            console.log('\nFirst 5 headings:');
            parsed.headings.slice(0, 5).forEach((h, i) => {
                console.log(`  ${i + 1}. ${h.substring(0, 60)}...`);
            });

            console.log('\n[5] Content Preview (first 1000 chars):');
            console.log(parsed.content.substring(0, 1000));
            console.log('...');

            // Save
            const ts = Date.now();
            fs.writeFileSync(`data/experiments/fixed_research_${ts}.md`,
                `# ${parsed.title}\n\n${parsed.content}`);
            console.log(`\n✅ Saved: data/experiments/fixed_research_${ts}.md`);
        } else {
            console.log('❌ Parse failed');
        }

        console.log('\n' + '='.repeat(60));
        console.log('TEST COMPLETE');
        console.log('='.repeat(60));

    } catch (e: any) {
        console.error('❌ Error:', e.message);
    } finally {
        if (browser) browser.close();
    }
}

main().catch(console.error);
