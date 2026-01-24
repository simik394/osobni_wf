
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
}

interface FileReport {
    sourceFile: string;
    testFile: string | null;
    testStats: TestStats | null;
    scenarios: TestScenario[];
    sourceLoc: number;
}

// Placeholder for test results structure and function, as they were not provided in the prompt.
// In a real scenario, these would be defined elsewhere or passed into generateReport.
interface TestResult {
    status: 'passed' | 'failed' | 'skipped' | 'todo';
    duration: number;
    failureMessages: string[];
}

function findTestResult(testResults: any, filePath: string, scenarioName: string): TestResult | null {
    if (!testResults || !testResults.testResults) return null;

    // Find the file result
    const fileResult = testResults.testResults.find((r: any) => r.name.endsWith(filePath));
    if (!fileResult) return null;

    // Find the specific assertion result
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

// Simple brace-counting parser to extract test blocks
function extractScenarios(content: string): TestScenario[] {
    const scenarios: TestScenario[] = [];
    // Regex to find start of test: it('name', async () => { ...
    const testStartRegex = /(?:it|test)\s*\(\s*['"`](.*?)['"`]\s*,\s*(?:async\s*)?\(\s*\)\s*=>\s*\{/g;

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
            scenarios.push({
                name: title,
                body: body.trim(),
                diagram: generateMermaidDiagram(title, body),
                startLine: startLine,
                endLine: endLine
            });
        }
    }
    return scenarios;
}

function sanitizeForMermaid(str: string): string {
    // Escape special characters that break Mermaid labels
    return str
        .replace(/["`]/g, "'")           // Replace double quotes with single
        .replace(/\(/g, '#40;')            // Escape opening parentheses
        .replace(/\)/g, '#41;')            // Escape closing parentheses  
        .replace(/\[/g, '#91;')            // Escape opening brackets
        .replace(/\]/g, '#93;')            // Escape closing brackets
        .replace(/\|/g, '#124;')           // Escape pipes
        .replace(/&/g, '#38;')             // Escape ampersands
        .replace(/</g, '#60;')             // Escape less than
        .replace(/>/g, '#62;')             // Escape greater than (except for <br/>)
        .replace(/#60;br\/#62;/g, '<br/>') // Restore <br/> tags
        .replace(/[\n\r]/g, " ")           // Replace newlines with spaces
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

    // Collapse consecutive types for cleaner diagram
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
        // Asserts usually separate acts, so we flush acts before asserts
        if (assertBuffer.length) {
            nodes.push({ id: `V${nodes.length}`, label: `Verify:<br/>${assertBuffer.map(sanitizeForMermaid).join('<br/>')}` });
            assertBuffer = [];
        }
    };

    // Heuristic: Asserts usually come last. We'll group everything roughly.
    // Actually, preserving order is better for understanding flow.

    for (const step of steps) {
        if (step.type === 'setup') {
            if (actBuffer.length || assertBuffer.length) flush();
            setupBuffer.push(step.text);
        } else if (step.type === 'act') {
            if (assertBuffer.length) flush(); // If we assert then act again
            // If checking act after setup, flush setup
            if (setupBuffer.length) flush();
            actBuffer.push(step.text);
        } else {
            // Assert
            if (setupBuffer.length) flush();
            if (actBuffer.length) flush();
            assertBuffer.push(step.text);
        }
    }
    flush();

    // Build edges
    for (let i = 0; i < nodes.length - 1; i++) {
        edges.push({ from: nodes[i].id, to: nodes[i + 1].id });
    }

    if (nodes.length === 0) return "graph TD\nEmpty[Empty Test Body]";

    return `graph TD\n${nodes.map(n => `    ${n.id}["${n.label}"]`).join('\n')}\n${edges.map(e => `    ${e.from} --> ${e.to}`).join('\n')}`;
}

function analyzeTestFile(filePath: string): { stats: TestStats, scenarios: TestScenario[] } {
    const content = fs.readFileSync(filePath, 'utf-8');

    // Quick regex stats
    const tests = (content.match(/(it|test)\s*\(/g) || []).length;
    const assertions = (content.match(/expect\s*\(/g) || []).length;
    const describes = (content.match(/describe\s*\(/g) || []).length;
    const mocks = (content.match(/vi\.(fn|mock|spyOn)|mock/g) || []).length;

    // Deep scenario extraction
    const scenarios = extractScenarios(content);

    return {
        stats: { tests, assertions, describes, mocks },
        scenarios
    };
}

function generateReport() {
    const srcFiles = getAllFiles(SRC_DIR).map(f => path.relative(SRC_DIR, f));
    const testFiles = getAllFiles(TEST_DIR).map(f => path.relative(TEST_DIR, f)); // Keep as map for lookup

    const report: FileReport[] = [];
    const usedTestFiles = new Set<string>();

    // 1. Map Source -> Tests
    for (const srcFile of srcFiles) {
        const baseName = path.basename(srcFile, '.ts');

        // Simple mapping heuristic
        const candidates = testFiles.filter(t => {
            const tBase = path.basename(t, '.ts');
            return tBase === `${baseName}.test` || tBase === `${baseName}.spec` || tBase === baseName;
        });

        // Special override for gemini-client -> prefer gemini-client.test
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

    // 2. Find Orphans
    const orphanFiles = testFiles.filter(t => !usedTestFiles.has(t));
    const orphans: { file: string, scenarios: TestScenario[] }[] = [];

    for (const orphan of orphanFiles) {
        if (!orphan.includes('.test.ts') && !orphan.includes('.spec.ts')) continue;
        const absolutePath = path.join(TEST_DIR, orphan);
        const analysis = analyzeTestFile(absolutePath);
        orphans.push({ file: orphan, scenarios: analysis.scenarios });
    }

    // --- OUTPUT MARKDOWN (QMD) ---
    console.log('---');
    console.log('title: "Detailed Test & Implementation Report"');
    console.log('format:');
    console.log('  html:');
    console.log('    code-fold: true');
    console.log('    toc: true');
    console.log('    theme: cosmo');
    console.log('    page-layout: full');
    console.log('execute:');
    console.log('  echo: false');
    console.log('---');

    console.log(`Generated on: ${new Date().toISOString()}`);
    console.log('');

    // Add test runner controls at the top
    console.log('## 🎮 Test Controls');
    console.log('');
    console.log('::: {.callout-note}');
    console.log('**Live Results Mode**: Start the test runner server (`npx ts-node scripts/test-runner-server.ts`), then use the button below to run tests and see live results.');
    console.log(':::');
    console.log('');
    console.log('```{ojs}');
    console.log('//| echo: false');
    console.log('TEST_SERVER = "http://localhost:3099"');
    console.log('');
    console.log('mutable testResults = null');
    console.log('mutable runStatus = "idle"');
    console.log('mutable lastRun = null');
    console.log('');
    console.log('async function fetchResults() {');
    console.log('  try {');
    console.log('    const response = await fetch(`${TEST_SERVER}/results`);');
    console.log('    if (response.ok) {');
    console.log('      mutable testResults = await response.json();');
    console.log('      mutable lastRun = new Date().toLocaleTimeString();');
    console.log('    }');
    console.log('  } catch (e) {');
    console.log('    console.log("Server not available, using static results");');
    console.log('  }');
    console.log('}');
    console.log('');
    console.log('async function runTests() {');
    console.log('  mutable runStatus = "running";');
    console.log('  try {');
    console.log('    await fetch(`${TEST_SERVER}/run-tests`, { method: "POST" });');
    console.log('    // Poll for completion');
    console.log('    let attempts = 0;');
    console.log('    while (attempts < 120) { // 2 min timeout');
    console.log('      await new Promise(r => setTimeout(r, 1000));');
    console.log('      const status = await fetch(`${TEST_SERVER}/status`).then(r => r.json());');
    console.log('      if (status.status === "completed" || status.status === "error") {');
    console.log('        await fetchResults();');
    console.log('        mutable runStatus = status.status;');
    console.log('        return;');
    console.log('      }');
    console.log('      attempts++;');
    console.log('    }');
    console.log('    mutable runStatus = "timeout";');
    console.log('  } catch (e) {');
    console.log('    mutable runStatus = "error";');
    console.log('  }');
    console.log('}');
    console.log('');
    console.log('// Auto-fetch on load');
    console.log('fetchResults();');
    console.log('```');
    console.log('');
    console.log('```{ojs}');
    console.log('//| echo: false');
    console.log('viewof runButton = Inputs.button(');
    console.log('  runStatus === "running" ? "⏳ Running Tests..." : "🧪 Run All Tests",');
    console.log('  { disabled: runStatus === "running", value: null, reduce: () => runTests() }');
    console.log(')');
    console.log('```');
    console.log('');
    console.log('```{ojs}');
    console.log('//| echo: false');
    console.log('md`**Status**: ${runStatus === "running" ? "⏳ Running..." : runStatus === "completed" ? "✅ Completed" : runStatus === "error" ? "❌ Error" : "⏸️ Idle"} ${lastRun ? `(Last run: ${lastRun})` : ""}`');
    console.log('```');
    console.log('');


    // Dashboard / Summary
    console.log('## 📊 Test Suite Overview');
    console.log('| Metric | Value |');
    console.log('|---|---|');
    const totalAssertions = report.reduce((sum, r) => sum + (r.testStats?.assertions || 0), 0) + orphans.reduce((sum, o) => {
        const stats = analyzeTestFile(path.join(TEST_DIR, o.file));
        return sum + stats.stats.assertions;
    }, 0);
    const totalTests = report.reduce((sum, r) => sum + (r.testStats?.tests || 0), 0) + orphans.reduce((sum, o) => {
        const stats = analyzeTestFile(path.join(TEST_DIR, o.file));
        return sum + stats.stats.tests;
    }, 0);

    console.log(`| **Total Tests** | ${totalTests} |`);
    console.log(`| **Total Assertions** | ${totalAssertions} |`);
    console.log(`| **Covered Files** | ${report.filter(r => r.testFile).length} / ${report.length} |`);
    console.log('\n');

    console.log('## 1. Source Component Coverage');
    console.log('| Component | LOC | Test File | Scenarios | Assertions | Status |');
    console.log('|---|---|---|---|---|---|');

    const coveredReports = report.filter(r => r.testFile).sort((a, b) => b.sourceLoc - a.sourceLoc);
    for (const r of coveredReports) {
        const assurance = (r.testStats?.assertions || 0) > 10 ? '🟢 Strong' : '🟡 Basic';
        console.log(`| \`${r.sourceFile}\` | ${r.sourceLoc} | \`${r.testFile}\` | ${r.scenarios.length} | ${r.testStats?.assertions} | ${assurance} |`);
    }

    console.log('\n## 2. Detailed Test Scenarios');
    console.log('::: {.callout-note}');
    console.log('Each scenario includes a Diagram, the Implementation Source (Embedded), and the Live Execution Result (calculated during render).');
    console.log(':::\n');

    // Load real test results if they exist
    let testResults: any = null;
    const resultsPath = path.join(__dirname, '../test-results.json');
    if (fs.existsSync(resultsPath)) {
        try {
            testResults = JSON.parse(fs.readFileSync(resultsPath, 'utf-8'));
        } catch (e) {
            console.error('Failed to parse test-results.json', e);
        }
    }

    // Combine all scenarios (Matched + Orphans)
    const allFileScenarios = [
        ...coveredReports.map(r => ({
            file: r.testFile!,
            scenarios: r.scenarios,
            type: 'Unit/Mapped'
        })),
        ...orphans.map(o => ({
            file: o.file,
            scenarios: o.scenarios,
            type: 'Integration/Orphan'
        }))
    ];

    for (const fileData of allFileScenarios) {
        if (fileData.scenarios.length === 0) continue;

        console.log(`### 📁 \`${fileData.file}\` <small class="text-muted">(${fileData.type})</small>`);

        for (const scenario of fileData.scenarios) {
            console.log(`\n#### 🧪 "${scenario.name}"`);

            // Get Execution Result
            const result = findTestResult(testResults, fileData.file, scenario.name);
            let statusCallout = '';

            if (result) {
                if (result.status === 'passed') {
                    statusCallout = `::: {.callout-tip appearance="simple" icon=true}\n## ✅ Passed (${result.duration}ms)\n:::\n`;
                } else if (result.status === 'failed') {
                    statusCallout = `::: {.callout-important appearance="simple" icon=true}\n## ❌ Failed (${result.duration}ms)\n${result.failureMessages.join('\n')}\n:::\n`;
                } else {
                    statusCallout = `::: {.callout-warning appearance="simple" icon=true}\n## ⚠️ ${result.status}\n:::\n`;
                }
            } else {
                statusCallout = `::: {.callout-note appearance="simple" icon=true}\n## 🤷 Status Unknown (Test not found in run)\n:::\n`;
            }

            // Status callout BEFORE tabset to avoid nesting issues
            console.log(statusCallout);
            console.log('');
            console.log('::: panel-tabset');

            console.log('##### 🧬 Flowchart');
            // Mermaid diagram with proper class definitions
            console.log('```{mermaid}');
            console.log('%%| fig-width: 100%');
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

            console.log('##### 💻 Implementation');
            // Use Quarto file include with line numbers
            if (scenario.startLine && scenario.endLine) {
                console.log(`\`\`\`{.typescript filename="tests/${fileData.file}" code-line-numbers="${scenario.startLine}-${scenario.endLine}"}`);
                console.log(scenario.body);
                console.log('```');
            } else {
                console.log('```typescript');
                console.log(scenario.body);
                console.log('```');
            }
            console.log('');

            console.log('##### ⚡ Live Result');

            // Generate a unique ID for this test's result container
            const testId = `test_${fileData.file.replace(/[^a-zA-Z0-9]/g, '_')}_${scenario.name.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30)}`;
            const safeName = scenario.name.replace(/"/g, '\\"').replace(/'/g, "\\'");

            console.log('**Command:**');
            console.log('```bash');
            console.log(`npx vitest run tests/${fileData.file} -t "${safeName}" --reporter=basic`);
            console.log('```');
            console.log('');

            // OJS block for dynamic result display
            console.log('```{ojs}');
            console.log('//| echo: false');
            console.log(`// Result for: ${scenario.name}`);
            console.log('{');
            console.log(`  const testFile = "${fileData.file}";`);
            console.log(`  const testName = "${scenario.name.replace(/"/g, '\\"')}";`);
            console.log('  ');
            console.log('  function findResult(results) {');
            console.log('    if (!results || !results.testResults) return null;');
            console.log('    for (const file of results.testResults) {');
            console.log('      if (file.name.includes(testFile)) {');
            console.log('        for (const assertion of file.assertionResults) {');
            console.log('          if (assertion.title === testName || assertion.fullName.includes(testName)) {');
            console.log('            return assertion;');
            console.log('          }');
            console.log('        }');
            console.log('      }');
            console.log('    }');
            console.log('    return null;');
            console.log('  }');
            console.log('  ');
            console.log('  const result = findResult(testResults);');
            console.log('  ');
            console.log('  if (!result) {');
            console.log('    return md`*No results available. Run tests to see live results.*`;');
            console.log('  } else if (result.status === "passed") {');
            console.log('    return md`✅ **Passed** in ${result.duration}ms`;');
            console.log('  } else if (result.status === "failed") {');
            console.log('    return md`❌ **Failed** in ${result.duration}ms`;');
            console.log('  } else {');
            console.log('    return md`⚠️ **${result.status}**`;');
            console.log('  }');
            console.log('}');
            console.log('```');
            console.log('');


            console.log(':::'); // End tabset
        }
        console.log('---\n');
    }
}

generateReport();
