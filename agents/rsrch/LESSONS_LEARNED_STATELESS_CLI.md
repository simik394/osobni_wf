# Lessons Learned: Stateless CLI Migration

## 1. Architecture: Client vs Server
- **Stateless CLI Mandate**: The CLI should only be a thin proxy. All browser logic, complex scraping, and heavy state management belong on the server.
- **sendServerRequest Pattern**: Standardizing on a single helper (`sendServerRequest`) for all server communication simplifies command logic and error handling.
- **Router Pattern**: Each major feature (Gemini, NotebookLM, Perplexity, AI Mode) should have its own server-side router to maintain modularity.

## 2. Refactoring & Technical Debt
- **Grepping for Local Execution**: Systematic use of `grep` to find `runLocal...` or `BrowserClient` calls in the CLI is essential for complete migrations.
- **Cleanup of Global Flags**: Removing deprecated flags (`--local`, `--cdp`) from the main entry point is the final step to enforce the new architecture and prevent user confusion.
- **Import Normalization**: Moving from local execution to server-based requests often leaves behind unused imports (like `BrowserClient`, `UniversalContext`) that should be purged to reduce bundle size and noise.

## 3. Server-Side Action Context
- **UniversalContext on Server**: The server needs to provide the same execution environment (ctx, deps) that the CLI used to provide locally. This ensures that existing `Action` functions can be reused without modification.
- **Tab Pooling**: Browser tabs should be managed via a pool (`browserClient.getTabPage`) rather than creating new browsers/tabs for every request, improving performance and reliability.

## 4. Verification
- **Build First**: Always run `npm run build` (or `tsc`) to verify that refactoring didn't break import paths or type safety, especially when moving code between directories.
- **Help Output**: Verifying the CLI `--help` output is a quick way to ensure that user-facing changes (like removed flags) are correctly applied.
