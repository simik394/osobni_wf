
import fs from 'fs';
import path from 'path';

const SRC_DIR = path.join(__dirname, '../src');
const TEST_DIR = path.join(__dirname, '../tests');

interface TestStats {
    tests: number;
    assertions: number;
    describes: number;
    mocks: number;
}

interface TestScenario {
    name: string;
    body: string;
    diagram: string;
    startLine?: number;
    endLine?: number;
    regionName?: string;  // e.g., "test:should-be-defined"
    regionStartLine?: number;  // Line number of #region marker
    regionEndLine?: number;    // Line number of #endregion marker
}

// Helper to sanitize test name to region name format
function sanitizeToRegionName(name: string): string {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .substring(0, 50);
}

// Find snippet markers in file content and confirm they exist
function findSnippetMarker(content: string, snippetName: string): boolean {
    const startMarker = `// start snippet ${snippetName}`;
    const endMarker = `// end snippet ${snippetName}`;
    return content.includes(startMarker) && content.includes(endMarker);
}

interface FileReport {
    sourceFile: string;
    testFile: string | null;
    testStats: TestStats | null;
    scenarios: TestScenario[];
    sourceLoc: number;
}

interface TestResult {
    status: 'passed' | 'failed' | 'skipped' | 'todo';
    duration: number;
    failureMessages: string[];
}

function findTestResult(testResults: any, filePath: string, scenarioName: string): TestResult | null {
    if (!testResults || !testResults.testResults) return null;
    const fileResult = testResults.testResults.find((r: any) => r.name.endsWith(filePath));
    if (!fileResult) return null;
    const assertion = fileResult.assertionResults.find((a: any) =>
        a.title === scenarioName || a.fullName.includes(scenarioName)
    );
    if (!assertion) return null;
    return {
        status: assertion.status,
        duration: assertion.duration || 0,
        failureMessages: assertion.failureMessages || []
    };
}

function getAllFiles(dirPath: string, arrayOfFiles: string[] = []): string[] {
    if (!fs.existsSync(dirPath)) return arrayOfFiles;
    const files = fs.readdirSync(dirPath);
    files.forEach(function (file) {
        if (fs.statSync(dirPath + "/" + file).isDirectory()) {
            arrayOfFiles = getAllFiles(dirPath + "/" + file, arrayOfFiles);
        } else {
            if (file.endsWith('.ts') && !file.endsWith('.d.ts')) {
                arrayOfFiles.push(path.join(dirPath, "/", file));
            }
        }
    });
    return arrayOfFiles;
}

function extractScenarios(content: string): TestScenario[] {
    const scenarios: TestScenario[] = [];
    const testStartRegex = /(?:it|test)\s*\(\s*['\"`](.*?)['\"`]\s*,\s*(?:async\s*)?\(\s*\)\s*=>\s*\{/g;

    let match;
    while ((match = testStartRegex.exec(content)) !== null) {
        const title = match[1];
        const startIndex = match.index + match[0].length;
        const startLine = content.substring(0, match.index).split('\n').length;

        let braceCount = 1;
        let currentIndex = startIndex;

        while (braceCount > 0 && currentIndex < content.length) {
            const char = content[currentIndex];
            if (char === '{') braceCount++;
            if (char === '}') braceCount--;
            currentIndex++;
        }

        if (braceCount === 0) {
            const body = content.substring(startIndex, currentIndex - 1);
            const endLine = content.substring(0, currentIndex - 1).split('\n').length;

            // Look for snippet markers
            const snippetName = sanitizeToRegionName(title);
            const hasSnippet = findSnippetMarker(content, snippetName);

            scenarios.push({
                name: title,
                body: body.trim(),
                diagram: generateMermaidDiagram(title, body),
                startLine: startLine,
                endLine: endLine,
                regionName: hasSnippet ? snippetName : undefined
            });
        }
    }
    return scenarios;
}

function sanitizeForMermaid(str: string): string {
    return str
        .replace(/["\`]/g, "'")
        .replace(/\(/g, '#40;')
        .replace(/\)/g, '#41;')
        .replace(/\[/g, '#91;')
        .replace(/\]/g, '#93;')
        .replace(/\|/g, '#124;')
        .replace(/&/g, '#38;')
        .replace(/</g, '#60;')
        .replace(/>/g, '#62;')
        .replace(/#60;br\/#62;/g, '<br/>')
        .replace(/[\n\r]/g, " ")
        .substring(0, 60) + (str.length > 60 ? "..." : "");
}

function generateMermaidDiagram(title: string, body: string): string {
    const lines = body.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('//'));
    const steps: { type: 'setup' | 'act' | 'assert', text: string }[] = [];

    for (const line of lines) {
        if (line.startsWith('expect')) {
            steps.push({ type: 'assert', text: line });
        } else if (line.includes('mock') || line.includes('spy') || line.includes('const ') || line.includes('let ')) {
            steps.push({ type: 'setup', text: line });
        } else {
            steps.push({ type: 'act', text: line });
        }
    }

    const nodes: { id: string, label: string }[] = [];
    const edges: { from: string, to: string }[] = [];

    let setupBuffer: string[] = [];
    let actBuffer: string[] = [];
    let assertBuffer: string[] = [];

    const flush = () => {
        if (setupBuffer.length) {
            nodes.push({ id: `S${nodes.length}`, label: `Setup:<br/>${setupBuffer.map(sanitizeForMermaid).join('<br/>')}` });
            setupBuffer = [];
        }
        if (actBuffer.length) {
            nodes.push({ id: `A${nodes.length}`, label: `Act:<br/>${actBuffer.map(sanitizeForMermaid).join('<br/>')}` });
            actBuffer = [];
        }
        if (assertBuffer.length) {
            nodes.push({ id: `V${nodes.length}`, label: `Verify:<br/>${assertBuffer.map(sanitizeForMermaid).join('<br/>')}` });
            assertBuffer = [];
        }
    };

    for (const step of steps) {
        if (step.type === 'setup') {
            if (actBuffer.length || assertBuffer.length) flush();
            setupBuffer.push(step.text);
        } else if (step.type === 'act') {
            if (assertBuffer.length) flush();
            if (setupBuffer.length) flush();
            actBuffer.push(step.text);
        } else {
            if (setupBuffer.length) flush();
            if (actBuffer.length) flush();
            assertBuffer.push(step.text);
        }
    }
    flush();

    for (let i = 0; i < nodes.length - 1; i++) {
        edges.push({ from: nodes[i].id, to: nodes[i + 1].id });
    }

    if (nodes.length === 0) return "graph TD\nEmpty[Empty Test Body]";

    return `graph TD\n${nodes.map(n => `    ${n.id}["${n.label}"]`).join('\n')}\n${edges.map(e => `    ${e.from} --> ${e.to}`).join('\n')}`;
}

function analyzeTestFile(filePath: string): { stats: TestStats, scenarios: TestScenario[] } {
    const content = fs.readFileSync(filePath, 'utf-8');
    const tests = (content.match(/(it|test)\s*\(/g) || []).length;
    const assertions = (content.match(/expect\s*\(/g) || []).length;
    const describes = (content.match(/describe\s*\(/g) || []).length;
    const mocks = (content.match(/vi\.(fn|mock|spyOn)|mock/g) || []).length;
    const scenarios = extractScenarios(content);
    return { stats: { tests, assertions, describes, mocks }, scenarios };
}

function generateReport() {
    const srcFiles = getAllFiles(SRC_DIR).map(f => path.relative(SRC_DIR, f));
    const testFiles = getAllFiles(TEST_DIR).map(f => path.relative(TEST_DIR, f));

    const report: FileReport[] = [];
    const usedTestFiles = new Set<string>();

    for (const srcFile of srcFiles) {
        const baseName = path.basename(srcFile, '.ts');
        const candidates = testFiles.filter(t => {
            const tBase = path.basename(t, '.ts');
            return tBase === `${baseName}.test` || tBase === `${baseName}.spec` || tBase === baseName;
        });

        let foundTestFile = candidates[0];
        if (baseName === 'gemini-client') {
            foundTestFile = candidates.find(c => c.includes('gemini-client.test')) || candidates[0];
        }

        let testStats: TestStats | null = null;
        let scenarios: TestScenario[] = [];

        if (foundTestFile) {
            usedTestFiles.add(foundTestFile);
            const absoluteTestPath = path.join(TEST_DIR, foundTestFile);
            const analysis = analyzeTestFile(absoluteTestPath);
            testStats = analysis.stats;
            scenarios = analysis.scenarios;
        }

        const srcContent = fs.readFileSync(path.join(SRC_DIR, srcFile), 'utf-8');
        const sourceLoc = srcContent.split('\n').filter(l => l.trim()).length;

        report.push({ sourceFile: srcFile, testFile: foundTestFile, testStats, scenarios, sourceLoc });
    }

    const orphanFiles = testFiles.filter(t => !usedTestFiles.has(t));
    const orphans: { file: string, scenarios: TestScenario[] }[] = [];

    for (const orphan of orphanFiles) {
        if (!orphan.includes('.test.ts') && !orphan.includes('.spec.ts')) continue;
        const absolutePath = path.join(TEST_DIR, orphan);
        const analysis = analyzeTestFile(absolutePath);
        orphans.push({ file: orphan, scenarios: analysis.scenarios });
    }

    // Load test results
    let testResults: any = null;
    const resultsPath = path.join(__dirname, '../../../_artifacts/reports/rsrch/test-results.json');
    if (fs.existsSync(resultsPath)) {
        try {
            testResults = JSON.parse(fs.readFileSync(resultsPath, 'utf-8'));
        } catch (e) {
            console.error('Failed to parse test-results.json', e);
        }
    }

    // Calculate summary stats
    const totalAssertions = report.reduce((sum, r) => sum + (r.testStats?.assertions || 0), 0) +
        orphans.reduce((sum, o) => sum + analyzeTestFile(path.join(TEST_DIR, o.file)).stats.assertions, 0);
    const totalTests = report.reduce((sum, r) => sum + (r.testStats?.tests || 0), 0) +
        orphans.reduce((sum, o) => sum + analyzeTestFile(path.join(TEST_DIR, o.file)).stats.tests, 0);

    let passed = 0, failed = 0, skipped = 0;
    if (testResults?.testResults) {
        for (const file of testResults.testResults) {
            for (const a of file.assertionResults) {
                if (a.status === 'passed') passed++;
                else if (a.status === 'failed') failed++;
                else skipped++;
            }
        }
    }

    // --- OUTPUT MARKDOWN (QMD) ---
    console.log('---');
    console.log('title: "Detailed Test & Implementation Report"');
    console.log('format:');
    console.log('  html:');
    console.log('    code-fold: true');
    console.log('    code-tools: true');
    console.log('    toc: true');
    console.log('    theme: cosmo');
    console.log('    page-layout: full');

    console.log('---');
    console.log('');
    console.log(`Generated on: ${new Date().toISOString()}`);
    console.log('');

    // Test Results Summary (from last run)
    console.log('## 📊 Test Results Summary');
    console.log('');
    if (testResults) {
        const runTime = testResults.startTime ? new Date(testResults.startTime).toLocaleString() : 'Unknown';
        console.log(`> **Last Run:** ${runTime}`);
        console.log('');
        console.log('| Status | Count |');
        console.log('|--------|-------|');
        console.log(`| ✅ Passed | ${passed} |`);
        console.log(`| ❌ Failed | ${failed} |`);
        console.log(`| ⏭️ Skipped | ${skipped} |`);
        console.log(`| **Total** | **${passed + failed + skipped}** |`);
    } else {
        console.log('::: {.callout-warning}');
        console.log('No test results found. Run `npm test -- --reporter=json --outputFile=test-results.json` to generate results.');
        console.log(':::');
    }
    console.log('');

    // Coverage Summary
    console.log('## 📈 Source Component Coverage');
    console.log('| Component | LOC | Test File | Scenarios | Assertions | Status |');
    console.log('|---|---|---|---|---|---|');

    const coveredReports = report.filter(r => r.testFile).sort((a, b) => b.sourceLoc - a.sourceLoc);
    for (const r of coveredReports) {
        const assurance = (r.testStats?.assertions || 0) > 10 ? '🟢 Strong' : '🟡 Basic';
        console.log(`| \`${r.sourceFile}\` | ${r.sourceLoc} | \`${r.testFile}\` | ${r.scenarios.length} | ${r.testStats?.assertions} | ${assurance} |`);
    }
    console.log('');

    // Detailed Test Scenarios
    console.log('## 🧪 Detailed Test Scenarios');
    console.log('');

    const allFileScenarios = [
        ...coveredReports.map(r => ({ file: r.testFile!, scenarios: r.scenarios, type: 'Unit/Mapped' })),
        ...orphans.map(o => ({ file: o.file, scenarios: o.scenarios, type: 'Integration/Orphan' }))
    ];

    for (const fileData of allFileScenarios) {
        if (fileData.scenarios.length === 0) continue;

        console.log(`### 📁 \`${fileData.file}\` <small>(${fileData.type})</small>`);
        console.log('');

        for (const scenario of fileData.scenarios) {
            const result = findTestResult(testResults, fileData.file, scenario.name);

            // Status badge
            let statusBadge = '❓ Unknown';
            let statusClass = 'callout-note';
            if (result) {
                if (result.status === 'passed') {
                    statusBadge = `✅ Passed (${result.duration.toFixed(2)}ms)`;
                    statusClass = 'callout-tip';
                } else if (result.status === 'failed') {
                    statusBadge = `❌ Failed (${result.duration.toFixed(2)}ms)`;
                    statusClass = 'callout-important';
                } else {
                    statusBadge = `⏭️ ${result.status}`;
                    statusClass = 'callout-warning';
                }
            }

            console.log(`#### 🧪 "${scenario.name}"`);
            console.log('');
            console.log(`::: {.${statusClass} appearance="simple"}`);
            console.log(`**${statusBadge}**`);
            if (result?.status === 'failed' && result.failureMessages.length > 0) {
                console.log('');
                console.log('```');
                console.log(result.failureMessages[0].substring(0, 300));
                console.log('```');
            }
            console.log(':::');
            console.log('');

            console.log('::: {.panel-tabset}');
            console.log('');

            // Flowchart tab
            console.log('##### 🧬 Flowchart');
            console.log('');
            console.log('```{mermaid}');
            console.log(scenario.diagram);
            console.log('');
            console.log('classDef setup fill:#e1f5fe,stroke:#01579b,stroke-width:2px');
            console.log('classDef act fill:#fff3e0,stroke:#ff6f00,stroke-width:2px');
            console.log('classDef assert fill:#e8f5e9,stroke:#2e7d32,stroke-width:2px');
            console.log('class S0,S1,S2,S3,S4,S5,S6,S7,S8,S9,S10 setup');
            console.log('class A0,A1,A2,A3,A4,A5,A6,A7,A8,A9,A10 act');
            console.log('class V0,V1,V2,V3,V4,V5,V6,V7,V8,V9,V10 assert');
            console.log('```');
            console.log('');

            // Implementation tab - use Quarto include-code-files extension with snippet
            console.log('##### 💻 Implementation');
            console.log('');

            // If we have snippet markers, use Quarto's include with snippet for TRUE embedding
            if (scenario.regionName) {
                console.log(`> 📄 **Snippet:** \`// start snippet ${scenario.regionName}\` in [\`tests/${fileData.file}\`](tests/${fileData.file})`);
                console.log('');
                // Use Quarto's include-code-files extension with snippet attribute
                // This reads from the actual file at render time!
                console.log(`\`\`\`{.typescript include="tests/${fileData.file}" snippet="${scenario.regionName}"}`);
                console.log('```');
            } else {
                // Fallback to inline body if no snippet markers
                console.log(`> 📄 **File:** [\`tests/${fileData.file}:${scenario.startLine}-${scenario.endLine}\`](tests/${fileData.file})`);
                console.log('');
                console.log('```typescript');
                console.log(scenario.body);
                console.log('```');
            }
            console.log('');

            // Command tab
            console.log('##### ▶️ Run Command');
            console.log('');
            const safeName = scenario.name.replace(/"/g, '\\"');
            console.log('```bash');
            console.log(`npx vitest run tests/${fileData.file} -t "${safeName}" --reporter=verbose`);
            console.log('```');
            console.log('');

            console.log(':::');
            console.log('');
        }
        console.log('---');
        console.log('');
    }

    // How to refresh results
    console.log('## 🔄 Refresh Test Results');
    console.log('');
    console.log('To update the results shown above:');
    console.log('');
    console.log('```bash');
    console.log('# Run tests and generate JSON results');
    console.log('npx vitest run --reporter=json --outputFile=test-results.json');
    console.log('');
    console.log('# Regenerate this report');
    console.log('npm run report:test');
    console.log('');
    console.log('# Render to HTML (handled by npm script above)');
    console.log('quarto render ../../_artifacts/reports/rsrch/TEST_REPORT.qmd');
    console.log('```');
}

generateReport();
