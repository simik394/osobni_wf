#!/usr/bin/env node
/**
 * Batch converter: converts all existing .html files in moodle_downloads to .md
 * Uses the same extractMainContentAsMarkdown logic as the crawler.
 * 
 * Usage:
 *   node convert_html_to_md.js [--course FILTER] [--dry-run] [--delete-html]
 * 
 * Options:
 *   --course FILTER    Only convert files in directories matching FILTER
 *   --dry-run          Show what would be converted without writing files
 *   --delete-html      Delete the original .html files after successful conversion
 */

const fs = require('fs');
const path = require('path');
const Extractor = require('./moodle_data_extractors');

const BASE_DIR = path.join(__dirname, 'moodle_downloads');
const isDryRun = process.argv.includes('--dry-run');
const deleteHtml = process.argv.includes('--delete-html');
const courseFilterIdx = process.argv.indexOf('--course');
const courseFilter = courseFilterIdx > -1 ? process.argv[courseFilterIdx + 1] : null;

function walkDir(dir) {
    const results = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            results.push(...walkDir(full));
        } else if (entry.isFile() && entry.name.endsWith('.html') && entry.name !== 'index.html') {
            results.push(full);
        }
    }
    return results;
}

function main() {
    const htmlFiles = walkDir(BASE_DIR);
    let filtered = htmlFiles;
    
    if (courseFilter) {
        filtered = htmlFiles.filter(f => f.includes(courseFilter));
    }

    console.log(`Found ${filtered.length} HTML files to convert.`);
    if (isDryRun) console.log('(DRY RUN - no files will be written)\n');

    let converted = 0;
    let skipped = 0;
    let errors = 0;

    for (const htmlPath of filtered) {
        const mdPath = htmlPath.replace(/\.html$/, '.md');
        const baseName = path.basename(htmlPath, '.html');
        const relPath = path.relative(BASE_DIR, htmlPath);

        // Skip if .md already exists
        if (fs.existsSync(mdPath)) {
            skipped++;
            continue;
        }

        try {
            const htmlContent = fs.readFileSync(htmlPath, 'utf8');
            const title = baseName.replace(/_/g, ' ');
            const md = Extractor.extractMainContentAsMarkdown(htmlContent, title);

            if (isDryRun) {
                console.log(`  [CONVERT] ${relPath}`);
                console.log(`            -> ${path.relative(BASE_DIR, mdPath)}`);
                console.log(`            (${md.length} chars)`);
            } else {
                fs.writeFileSync(mdPath, md, 'utf8');
                console.log(`  ✓ ${relPath} -> .md (${md.length} chars)`);
                
                if (deleteHtml) {
                    fs.unlinkSync(htmlPath);
                    console.log(`    🗑 Deleted ${path.basename(htmlPath)}`);
                }
            }
            converted++;
        } catch (e) {
            console.error(`  ✗ Error converting ${relPath}: ${e.message}`);
            errors++;
        }
    }

    console.log(`\n--- Summary ---`);
    console.log(`  Converted: ${converted}`);
    console.log(`  Skipped:   ${skipped} (already have .md)`);
    console.log(`  Errors:    ${errors}`);
}

main();
