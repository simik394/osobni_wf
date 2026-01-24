# Test Report Generation Guide

> Test-specific implementation of the [Living Documentation Standard](./LIVING_DOCUMENTATION.md).

This guide covers generating **interactive test reports** using Quarto. For other report types (API, CLI, architecture), see the main standard.

## Quick Start

```bash
# 1. Run tests and save results
npx vitest run --reporter=json --outputFile=test-results.json

# 2. Generate the QMD file
npx ts-node scripts/generate_test_report.ts > TEST_REPORT.qmd

# 3. Render to HTML
quarto render TEST_REPORT.qmd
```

Open `TEST_REPORT.html` in a browser to view the report.

---

## How It Works

### Architecture

```
┌─────────────────────┐     ┌──────────────────────┐     ┌─────────────────┐
│   Test Files        │ ──► │ generate_test_report │ ──► │ TEST_REPORT.qmd │
│   (*.test.ts)       │     │      .ts             │     │                 │
│                     │     │                      │     │                 │
│ // start snippet X  │     │ Extracts scenarios,  │     │ {include=       │
│ it('test', () => {  │     │ generates Mermaid,   │     │  snippet="X"}   │
│   ...               │     │ outputs QMD          │     │                 │
│ // end snippet X    │     │                      │     │                 │
└─────────────────────┘     └──────────────────────┘     └────────┬────────┘
                                                                  │
                            ┌──────────────────────┐              │ quarto render
                            │  test-results.json   │              ▼
                            │                      │     ┌─────────────────┐
                            │ Pass/Fail/Duration   │ ──► │ TEST_REPORT.html│
                            └──────────────────────┘     │ (Interactive)   │
                                                         └─────────────────┘
```

### Key Components

| Component | Purpose |
|-----------|---------|
| `scripts/generate_test_report.ts` | Parses test files, generates QMD |
| `scripts/add_test_regions.ts` | Adds snippet markers to test files |
| `_extensions/quarto-ext/include-code-files/` | Quarto extension for code embedding |
| `test-results.json` | Latest vitest results (run separately) |
| `TEST_REPORT.qmd` | Generated Quarto Markdown |
| `TEST_REPORT.html` | Final rendered report |

---

## Code Embedding with Snippets

### The Snippet System

Instead of hardcoding test code in the report (which gets stale), we use **snippet markers** that tell Quarto to read directly from source files at render time.

#### Step 1: Mark Your Tests

Wrap each test with snippet markers:

```typescript
// start snippet should-validate-input
it('should validate input', () => {
    const result = validate('hello');
    expect(result).toBe(true);
});
// end snippet should-validate-input
```

**Naming Convention:**
- Lowercase, hyphenated
- Derived from test name
- Max 50 characters

#### Step 2: Generate Report

The generator detects snippet markers and outputs:

```qmd
```{.typescript include="tests/validation.test.ts" snippet="should-validate-input"}
```
```

#### Step 3: Quarto Reads Source

When you run `quarto render`, it reads the actual source file and extracts only the content between the markers. **If the source changes, the report updates automatically!**

### Adding Snippets to Existing Tests

Run:
```bash
npx ts-node scripts/add_test_regions.ts
```

This scans all `*.test.ts` files and adds markers around each `it()` or `test()` block.

---

## Report Features

### Test Results Summary

The report shows aggregated results from `test-results.json`:

| Status | Count |
|--------|-------|
| ✅ Passed | 93 |
| ❌ Failed | 2 |
| ⏭️ Skipped | 17 |

### Per-Test Tabs

Each test scenario has three tabs:

| Tab | Content |
|-----|---------|
| 🧬 Flowchart | Mermaid diagram of test steps |
| 💻 Implementation | Actual source code (from snippet) |
| ▶️ Run Command | Copy-paste vitest command |

### Status Badges

Each test shows its result inline:
- ✅ **Passed (1.43ms)**
- ❌ **Failed**
- ⏭️ **Skipped**

---

## Updating the Report

### Full Refresh (Tests + Report)

```bash
# Run all tests
npx vitest run --reporter=json --outputFile=test-results.json

# Regenerate and render
npx ts-node scripts/generate_test_report.ts > TEST_REPORT.qmd
quarto render TEST_REPORT.qmd
```

### Quick Re-render (Code Changes Only)

If you only modified test code (and snippet markers exist):

```bash
quarto render TEST_REPORT.qmd
```

The `include-code-files` extension will pick up source changes automatically.

---

## Troubleshooting

### Snippet Shows Whole File

**Cause:** Snippet name contains hyphens or special chars that aren't escaped in the Lua filter.

**Fix:** We've patched `_extensions/quarto-ext/include-code-files/include-code-files.lua` to:
1. Support `.ts` files (line 29)
2. Escape Lua pattern magic characters (line 42)

If you reinstall the extension, reapply these patches.

### Empty Implementation Tab

**Cause:** Snippet markers are missing or misnamed.

**Fix:**
1. Check the test file has `// start snippet <name>` and `// end snippet <name>`
2. Ensure the name matches what the generator outputs
3. Re-run `npx ts-node scripts/add_test_regions.ts`

### Mermaid Diagram Not Rendering

**Cause:** Special characters in node labels.

**Fix:** The generator sanitizes labels. If you see raw Mermaid text:
1. Check for unescaped chars: `()[]|<>`
2. The `sanitizeForMermaid()` function handles these

---

## Extending the Report

### Adding New Test Files

1. Create your `tests/new-feature.test.ts`
2. Run `npx ts-node scripts/add_test_regions.ts` to add snippet markers
3. Regenerate the report

### Customizing the Generator

Edit `scripts/generate_test_report.ts`:

- **Add new tabs:** Look for `console.log('##### ⚡ Tab Name')`
- **Change styling:** Modify the YAML frontmatter section
- **Add tests from new dirs:** Update `TEST_DIR` constant

### Contributing Patches Upstream

If you improve the Lua filter, consider contributing to:
https://github.com/quarto-ext/include-code-files

---

## Prerequisites

| Tool | Installation |
|------|-------------|
| Quarto | https://quarto.org/docs/get-started/ |
| Node.js | `nvm install 20` |
| ts-node | `npm install -g ts-node` |
| Vitest | Included in project dependencies |

---

See also: [`LIVING_DOCUMENTATION.md`](./LIVING_DOCUMENTATION.md) for general principles.
