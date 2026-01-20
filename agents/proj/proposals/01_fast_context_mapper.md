# Fast Context Mapper (FCM) - Design Specification

## Objective
Create a **robust, CloudAI-less, near-instant** tool to:
1. Create customized maps of the codebase (directory structure, dependencies).
2. Extract actionable items (Issues, TODOs, FIXMEs) from source code.
3. Prepare context for AI agents without relying on AI for the extraction itself.

## Core Philosophy
- **Speed**: < 100ms for typical queries.
- **Determinism**: No LLM hallucinations. Validated regex/AST only.
- **Privacy**: Local processing only.
- **Integration**: JSON output pipeline-ready for `jules`, `planner`, and `youtrack`.

## Architecture

### 1. Technology Stack
- **Engine**: `ripgrep` (rg) (Installed: `/usr/bin/rg`) for content search.
- **Wrapper**: Python 3 (Standard Library) for logic and JSON structuring.
- **Format**: JSON schema compatible with Agent Context Protocol.

### 2. Components

#### A. Issue Harvester (`harvester.py`)
Scans codebase for task markers.
- **Patterns**:
    - `TODO(user): description`
    - `FIXME: critical issue`
    - `@task: [ID] description`
- **Output**:
    ```json
    {
      "file": "src/main.py",
      "line": 42,
      "type": "TODO",
      "author": "sim", // via git blame
      "content": "Refactor this mess",
      "context_hash": "sha256..."
    }
    ```

#### B. Structure Mapper (`mapper.py`)
Generates a semantic tree of the project.
- **Logic**:
    - Respects `.gitignore`.
    - Classifies files (Source, Config, Doc, Asset).
    - Heuristics for "Key Files" (e.g., `README.md`, `package.json`).
- **Output**: Markdown Tree or JSON Graph.

#### C. Context Assembler (`assembler.py`)
Combines A + B into a prompt-ready context block.
- **Features**:
    - Token counting (local).
    - Smart truncation (prioritize interfaces over implementation).

## Workflow Integration

1.  **Pre-Commit**: Harvester checks for new TODOs.
2.  **Agent Start**: Assembler generates `context.md` for `rsrch`/`jules`.
3.  **Sync**: `planner` agent reads Harvester JSON and updates YouTrack (creating/linking issues).

## Implementation Plan

1.  **Prototype (`scripts/fcm.py`)**:
    - Implement `rg` wrapper.
    - Test regex patterns on `01-pwf`.
2.  **Integration**:
    - Add to `jules-go` context pipeline.
    - Add to `youtrack.conf` as a data source.

## Comparison

| Feature | `repomix` | FCM (This Proposal) |
|---------|-----------|---------------------|
| Speed | Slow (Node) | **Fast (Rust/Py)** |
| Parsing | File concatenation | **Structured Extraction** |
| Metadata | Minimal | **Git Blame, Issue Linking** |
| AI Dep. | No | **No** |
