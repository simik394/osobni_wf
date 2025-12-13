# Feature Proposal: Langfuse Integration for Research Agents

> **Status**: Proposed
> **Date**: 2025-12-13
> **Target**: `agents/rsrch` (and potentially `agents/angrav`)

## 1. Overview
Integrate [Langfuse](https://langfuse.com/) (open-source LLM engineering platform) into the `rsrch` agent ecosystem. This will provide comprehensive tracing, observability, and evaluation capabilities for the automated research workflows (Perplexity, Gemini, NotebookLM).

## 2. Problem Statement
- **Lack of Visibility**: Currently, complex multi-step agent workflows (like the unified research-to-podcast flow) are "black boxes" during execution. Logs are transient and hard to analyze.
- **Debugging Difficulty**: When a step fails (e.g., Gemini parsing or export), it's difficult to trace the exact input/output and latency of each preceding step.
- **Cost/Quality Tracking**: No easy way to track token usage, latency, or output quality over time across different model versions or prompts.

## 3. Goals
1. **Full Tracing**: Trace every execution of the `rsrch` CLI and Server operations.
2. **Granular Spans**: Capture distinct spans for:
   - Perplexity API calls
   - Gemini browser automation steps (navigation, research, parsing)
   - NotebookLM operations (notebook creation, audio generation)
3. **Metadata Capture**: Store query details, session IDs, and registry artifacts (links to docs/audio) in the trace.
4. **Error Tracking**: Automatically capture and tag errors (selectors failing, timeouts) in the trace.

## 4. Technical Design

### 4.1 Dependencies
- Add `langfuse` (Node.js SDK) to `agents/rsrch/package.json`.

### 4.2 Configuration
- Use environment variables (already provisioned by Ansible):
  - `LANGFUSE_PUBLIC_KEY`
  - `LANGFUSE_SECRET_KEY`
  - `LANGFUSE_HOST` (e.g., `http://localhost:3000` or hosted)

### 4.3 Integration Points

#### `src/client.ts` (Perplexity)
- Wrap `query()` in a trace/span.
- Capture prompt and response text.

#### `src/gemini-client.ts`
- Instrument key methods:
  - `research()`: Trace the "Deep Research" process.
  - `parseResearch()`: Trace the DOM parsing logic (critical for reliability).
  - `createGoogleDoc()`: Trace the export process.

#### `src/server.ts`
- Create a **root trace** for each incoming HTTP request (e.g., `/research-to-podcast`).
- Pass the trace context to the clients (`GeminiClient`, `NotebookLMClient`) so their actions appear as child spans.

### 4.4 Example Trace Structure
```
Trace: Unified Research Flow (Job #oorv8qj5)
├── Span: Perplexity Query
│   └── Generation: LLM Response
├── Span: Gemini Deep Research
│   ├── Span: Navigate
│   └── Span: Wait for Completion
├── Span: Parse & Export
│   ├── Span: Extract Content
│   └── Span: Create Google Doc
└── Span: NotebookLM Audio
    ├── Span: Add Source
    └── Span: Generate Audio
```

## 5. Work Breakdown Structure (WBS)

### Phase 1: Setup & Core Integration
- [ ] Install `langfuse` package in `agents/rsrch`.
- [ ] Create `src/tracing.ts` helper module for singleton initialization.
- [ ] Verify connection to Langfuse instance (deployed via Ansible).

### Phase 2: Instrument Clients
- [ ] Add tracing to `PerplexityClient`.
- [ ] Add tracing to `GeminiClient` (focus on `research` and `parse`).
- [ ] Add tracing to `NotebookLMClient`.

### Phase 3: Server & Workflow Tracing
- [ ] Instrument `src/server.ts` endpoints.
- [ ] Ensure trace context propagation (parent -> child spans).

### Phase 4: Testing
- [ ] Run a full "dry run" workflow.
- [ ] Verify trace appears in Langfuse UI.
- [ ] Verify errors are correctly reported in traces.

## 6. Future Scope (Optional)
- **Evaluations**: Add programmatic evaluation of research quality using Langfuse scores.
- **Dataset Creation**: Automatically turn successful research sessions into datasets for fine-tuning.
- **Antigravity IDE**: Extend tracing to `agents/angrav` tests if needed (as requested).
