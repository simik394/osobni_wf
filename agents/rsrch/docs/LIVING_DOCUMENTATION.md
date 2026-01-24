
# Living Documentation Standard

> "Documentation that doesn't run is just a lie waiting to happen."

This guide outlines the philosophy for creating **Programmatic, Living Documentation** within the `rsrch` ecosystem.

## Core Philosophy

1. **Single Source of Truth:** Implementation code is the only truth. Reports extract from it, never duplicate.
2. **Execution is Verification:** Documentation must *run* the code it describes.
3. **Visual Abstraction:** Use generated diagrams to explain complexity, linked to actual source.

## The Toolkit

| Tool | Purpose |
|------|---------|
| [Quarto](https://quarto.org/) | Rendering engine for rich HTML output |
| [Mermaid.js](https://mermaid.js.org/) | Flowcharts and diagrams |
| TypeScript scripts | Parsing and generation |
| `include-code-files` extension | Embedding source code via snippets |

## Implementation Guides

### Test Reports
📖 **[TEST_REPORT_GUIDE.md](./TEST_REPORT_GUIDE.md)** — Complete guide for generating test reports with:
- Snippet-based code embedding
- Mermaid flowcharts
- Pass/fail badges from vitest results

**Quick Start:**
```bash
npx vitest run --reporter=json --outputFile=test-results.json
npx ts-node scripts/generate_test_report.ts > TEST_REPORT.qmd
quarto render TEST_REPORT.qmd
```

### Other Applications

The same principles apply to:

- **API Reference:** Parse `server.ts` routes → generate API docs with `curl` examples
- **CLI Reference:** Parse `commander` definitions → verify all commands exist
- **Architecture Maps:** Parse imports → generate dependency graphs
