/**
 * Script to add region markers to test files for stable code embedding.
 * 
 * This adds `// #region test:<sanitized-name>` and `// #endregion` markers
 * around each it() or test() block, enabling stable references in documentation.
 * 
 * Usage: npx ts-node scripts/add_test_regions.ts
 * 
 * The markers look like:
 * 
 * // #region test:should-be-defined
 * it('should be defined', async () => {
 *     expect(GeminiClient).toBeDefined();
 * });
 * // #endregion test:should-be-defined
 */

import fs from 'fs';
import path from 'path';

const TEST_DIR = path.join(__dirname, '../tests');

function sanitizeRegionName(name: string): string {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .substring(0, 50);
}

function getAllTestFiles(dirPath: string, arrayOfFiles: string[] = []): string[] {
    if (!fs.existsSync(dirPath)) return arrayOfFiles;
    const files = fs.readdirSync(dirPath);

    files.forEach(function (file) {
        const fullPath = path.join(dirPath, file);
        if (fs.statSync(fullPath).isDirectory()) {
            arrayOfFiles = getAllTestFiles(fullPath, arrayOfFiles);
        } else if (file.endsWith('.test.ts') || file.endsWith('.spec.ts')) {
            arrayOfFiles.push(fullPath);
        }
    });
    return arrayOfFiles;
}

interface TestBlock {
    name: string;
    regionName: string;
    startIndex: number;
    endIndex: number;
    startLine: number;
    endLine: number;
}

function findTestBlocks(content: string): TestBlock[] {
    const blocks: TestBlock[] = [];
    const testStartRegex = /(\s*)(it|test)\s*\(\s*['\"`](.*?)['\"`]\s*,\s*(?:async\s*)?\(\s*\)\s*=>\s*\{/g;

    let match;
    while ((match = testStartRegex.exec(content)) !== null) {
        const whitespace = match[1];
        const testName = match[3];
        const regionName = sanitizeRegionName(testName);
        const startIndex = match.index;
        const startLine = content.substring(0, startIndex).split('\n').length;

        // Find the end of the test block by counting braces
        let braceCount = 1;
        let currentIndex = match.index + match[0].length;

        while (braceCount > 0 && currentIndex < content.length) {
            const char = content[currentIndex];
            if (char === '{') braceCount++;
            if (char === '}') braceCount--;
            currentIndex++;
        }

        // Find the closing ); of the it() or test() call
        while (currentIndex < content.length && content[currentIndex] !== ';') {
            currentIndex++;
        }
        if (content[currentIndex] === ';') currentIndex++;

        const endIndex = currentIndex;
        const endLine = content.substring(0, endIndex).split('\n').length;

        blocks.push({
            name: testName,
            regionName,
            startIndex,
            endIndex,
            startLine,
            endLine
        });
    }

    return blocks;
}

function addRegionMarkers(filePath: string): { modified: boolean; regionsAdded: number } {
    let content = fs.readFileSync(filePath, 'utf-8');

    // Check if already has region markers
    if (content.includes('// #region test:')) {
        console.log(`  ⏭️  ${path.basename(filePath)} - already has regions`);
        return { modified: false, regionsAdded: 0 };
    }

    const blocks = findTestBlocks(content);

    if (blocks.length === 0) {
        console.log(`  ⚠️  ${path.basename(filePath)} - no test blocks found`);
        return { modified: false, regionsAdded: 0 };
    }

    // Sort blocks by startIndex in reverse order so we can insert without shifting indices
    blocks.sort((a, b) => b.startIndex - a.startIndex);

    // Track unique region names to handle duplicates
    const usedNames = new Map<string, number>();

    for (const block of blocks) {
        // Handle duplicate names
        let finalRegionName = block.regionName;
        const count = usedNames.get(block.regionName) || 0;
        if (count > 0) {
            finalRegionName = `${block.regionName}-${count}`;
        }
        usedNames.set(block.regionName, count + 1);

        // Determine the indentation of the test block
        const lineStart = content.lastIndexOf('\n', block.startIndex) + 1;
        const indent = content.substring(lineStart, block.startIndex).match(/^\s*/)?.[0] || '    ';

        // Insert end region on a new line after the block
        content =
            content.substring(0, block.endIndex) +
            `\n${indent}// #endregion test:${finalRegionName}` +
            content.substring(block.endIndex);

        // Insert start region before the line containing the block
        content =
            content.substring(0, lineStart) +
            `${indent}// #region test:${finalRegionName}\n` +
            content.substring(lineStart);
    }

    fs.writeFileSync(filePath, content);
    console.log(`  ✅  ${path.basename(filePath)} - added ${blocks.length} regions`);

    return { modified: true, regionsAdded: blocks.length };
}

function main() {
    console.log('🏷️  Adding region markers to test files...\n');

    const testFiles = getAllTestFiles(TEST_DIR);
    console.log(`Found ${testFiles.length} test files\n`);

    let totalModified = 0;
    let totalRegions = 0;

    for (const file of testFiles) {
        const result = addRegionMarkers(file);
        if (result.modified) {
            totalModified++;
            totalRegions += result.regionsAdded;
        }
    }

    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`✅ Modified ${totalModified} files`);
    console.log(`🏷️  Added ${totalRegions} region markers total`);
    console.log(`\nRegion format: // #region test:<sanitized-name>`);
}

main();
