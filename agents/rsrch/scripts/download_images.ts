/**
 * Download images from clipboard URLs using your logged-in browser session.
 * 
 * USAGE:
 * 1. Start Chrome with remote debugging:
 *    google-chrome --remote-debugging-port=9222
 * 
 * 2. Log into Reddit (if needed) in that browser
 * 
 * 3. Run this script:
 *    cd /home/sim/Obsi/Prods/01-pwf/agents/rsrch && npx tsx scripts/download_images.ts
 */

import { chromium } from 'playwright-extra';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

const CDP_PORT = process.env.CDP_PORT || '9222';
const OUTPUT_DIR = path.join(process.env.HOME!, 'Downloads', `clipboard_images_${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15)}`);

async function main() {
    // Get clipboard content
    let clipboard: string;
    try {
        clipboard = execSync('xclip -selection clipboard -o 2>/dev/null').toString();
    } catch {
        console.error('Failed to read clipboard');
        process.exit(1);
    }

    // Extract all URLs with image extensions (including encoded ones)
    const urls: string[] = [];
    for (const line of clipboard.split('\n')) {
        if (!line.trim()) continue;

        // Handle Reddit media URLs
        if (line.includes('reddit.com/media?url=')) {
            const match = line.match(/url=([^&\s]+)/);
            if (match) {
                const decoded = decodeURIComponent(match[1]);
                if (/\.(jpg|jpeg|png|gif|webp)/i.test(decoded)) {
                    urls.push(decoded);
                }
            }
        }
        // Direct image URLs
        else if (/\.(jpg|jpeg|png|gif|webp)/i.test(line)) {
            urls.push(line.trim());
        }
    }

    console.log(`📁 Output: ${OUTPUT_DIR}`);
    console.log(`🔗 Found ${urls.length} image URLs`);

    if (urls.length === 0) {
        console.log('No image URLs found in clipboard');
        process.exit(0);
    }

    fs.mkdirSync(OUTPUT_DIR, { recursive: true });

    // Connect to existing browser session
    console.log(`🔌 Connecting to Chrome on port ${CDP_PORT}...`);
    let browser;
    try {
        browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`, { timeout: 10000 });
        console.log('✅ Connected to browser');
    } catch (e: any) {
        console.error(`\n❌ Failed to connect to Chrome on port ${CDP_PORT}`);
        console.error('');
        console.error('Start Chrome with remote debugging:');
        console.error(`  google-chrome --remote-debugging-port=${CDP_PORT}`);
        console.error('');
        console.error('Or if Chrome is already running, close it and restart with:');
        console.error(`  google-chrome --remote-debugging-port=${CDP_PORT}`);
        process.exit(1);
    }

    // Get or create a context and page
    const contexts = browser.contexts();
    const context = contexts[0] || await browser.newContext();
    const page = await context.newPage();

    let success = 0;
    let failed = 0;

    for (let i = 0; i < urls.length; i++) {
        const url = urls[i];
        const filename = `${String(i + 1).padStart(3, '0')}_${url.split('/').pop()?.split('?')[0] || 'image.jpg'}`;
        const filepath = path.join(OUTPUT_DIR, filename);

        process.stdout.write(`\r⬇️  ${i + 1}/${urls.length}: ${filename.slice(0, 50).padEnd(50)}...`);

        try {
            const response = await page.goto(url, { timeout: 15000, waitUntil: 'load' });

            if (response?.ok()) {
                const buffer = await response.body();
                // Check if it's actually an image (not HTML error page)
                const contentType = response.headers()['content-type'] || '';
                if (contentType.includes('image') || buffer.length > 1000) {
                    fs.writeFileSync(filepath, buffer);
                    success++;
                } else {
                    console.log(`\n   ⚠️  Not an image: ${url}`);
                    failed++;
                }
            } else {
                console.log(`\n   ⚠️  HTTP ${response?.status()}: ${url}`);
                failed++;
            }
        } catch (e: any) {
            console.log(`\n   ❌ Error: ${e.message.slice(0, 50)}`);
            failed++;
        }
    }

    await page.close();

    console.log('\n');
    console.log('✅ Download complete!');
    console.log(`   Success: ${success}`);
    console.log(`   Failed: ${failed}`);
    console.log(`   Location: ${OUTPUT_DIR}`);

    const files = fs.readdirSync(OUTPUT_DIR);
    console.log(`   Files: ${files.length}`);
}

main().catch(console.error);
