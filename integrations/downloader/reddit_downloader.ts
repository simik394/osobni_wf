#!/usr/bin/env npx tsx
/**
 * Reddit Image Downloader using Playwright
 * Downloads images in WebP format with descriptive filenames
 */

import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

interface DownloadResult {
    url: string;
    filename: string;
    success: boolean;
    error?: string;
}

async function decodeRedditUrl(url: string): Promise<{ imageUrl: string; filename: string } | null> {
    // Handle reddit.com/media?url=... format
    const match = url.match(/reddit\.com\/media\?url=([^&]+)/);
    if (match) {
        const decodedUrl = decodeURIComponent(match[1]);
        // Extract descriptive name from URL
        const nameMatch = decodedUrl.match(/preview\.redd\.it\/([^?]+)/);
        if (nameMatch) {
            let filename = nameMatch[1];
            // Change extension to .webp since we're requesting webp
            filename = filename.replace(/\.(jpg|jpeg|png|gif)$/, '.webp');
            return { imageUrl: decodedUrl, filename };
        }
    }

    // Handle direct preview.redd.it URLs
    if (url.includes('preview.redd.it')) {
        const nameMatch = url.match(/preview\.redd\.it\/([^?]+)/);
        if (nameMatch) {
            let filename = nameMatch[1];
            filename = filename.replace(/\.(jpg|jpeg|png|gif)$/, '.webp');
            return { imageUrl: url, filename };
        }
    }

    return null;
}

async function downloadImage(
    page: any,
    imageUrl: string,
    outputPath: string
): Promise<boolean> {
    try {
        // Navigate to the image URL - this will load the WebP version
        const response = await page.goto(imageUrl, { waitUntil: 'load', timeout: 30000 });

        if (!response || response.status() !== 200) {
            console.error(`  ❌ HTTP ${response?.status()} for ${imageUrl}`);
            return false;
        }

        // Get the image data
        const buffer = await response.body();

        // Check if it's actually an image (not HTML error page)
        const isImage = buffer.length > 100 && !buffer.toString('utf8', 0, 100).includes('<!DOCTYPE');

        if (!isImage) {
            console.error(`  ❌ Not an image (got HTML) for ${imageUrl}`);
            return false;
        }

        // Write to file
        fs.writeFileSync(outputPath, buffer);
        return true;
    } catch (error) {
        console.error(`  ❌ Error: ${error}`);
        return false;
    }
}

async function main() {
    const inputFile = process.argv[2];
    const outputDir = process.argv[3] || './downloads';

    if (!inputFile) {
        console.error('Usage: reddit_downloader.ts <input_file> [output_dir]');
        process.exit(1);
    }

    // Read URLs from file
    const content = fs.readFileSync(inputFile, 'utf-8');
    const allUrls = content.split('\n').filter(line => line.trim());

    // Filter to Reddit URLs only
    const redditUrls = allUrls.filter(url =>
        url.includes('reddit.com/media') || url.includes('preview.redd.it')
    );

    console.log(`📷 Found ${redditUrls.length} Reddit image URLs`);

    if (redditUrls.length === 0) {
        console.log('No Reddit URLs to download');
        process.exit(0);
    }

    // Create output directory
    const redditDir = path.join(outputDir, 'reddit');
    fs.mkdirSync(redditDir, { recursive: true });

    // Launch browser with stealth settings
    const browser = await chromium.launch({
        headless: true,
        args: [
            '--disable-blink-features=AutomationControlled',
            '--no-sandbox',
        ]
    });

    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        extraHTTPHeaders: {
            'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
        }
    });

    const page = await context.newPage();

    let success = 0;
    let failed = 0;

    for (let i = 0; i < redditUrls.length; i++) {
        const url = redditUrls[i];
        const parsed = await decodeRedditUrl(url);

        if (!parsed) {
            console.log(`  ⚠️  Skipping unparseable URL: ${url.substring(0, 50)}...`);
            continue;
        }

        const { imageUrl, filename } = parsed;
        const numberedFilename = `${String(i + 1).padStart(3, '0')}_${filename}`;
        const outputPath = path.join(redditDir, numberedFilename);

        process.stdout.write(`[${i + 1}/${redditUrls.length}] ${filename.substring(0, 40)}... `);

        const ok = await downloadImage(page, imageUrl, outputPath);

        if (ok) {
            console.log('✅');
            success++;
        } else {
            failed++;
        }

        // Small delay to avoid rate limiting
        await new Promise(r => setTimeout(r, 200));
    }

    await browser.close();

    console.log('');
    console.log('═'.repeat(40));
    console.log(`✅ Downloaded: ${success}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`📁 Output: ${redditDir}`);
    console.log('═'.repeat(40));
}

main().catch(console.error);
