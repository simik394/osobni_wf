# mapObsi (Vault Librarian) - TODO

> **Last Updated**: 2025-12-30
> **Status**: Active Development

This file tracks all planned work for the Vault Librarian project.

---

## Priority 1: Documentation

- [x] Create consolidated Getting Started guide (`docs/GETTING_STARTED.md`)
- [x] Update main README with clearer project overview
- [x] Document FalkorDB schema (`docs/SCHEMA.md`)
- [x] Add Extensibility Guide for non-Obsidian locations (`docs/EXTENSIBILITY.md`)
- [x] Add CHANGELOG.md for release tracking

---

## Priority 2: Testing

### Go Implementation (`implementations/go/`)

- [x] **Parser Tests** (`internal/parser/parser_test.go`) - 14 tests
  - [x] Test markdown frontmatter extraction
  - [x] Test wikilink `[[link]]` parsing
  - [x] Test tag `#tag` extraction
  - [x] Test code file parsing (functions, classes)
  - [x] Test edge cases (empty files, malformed frontmatter)

- [x] **Config Tests** (`internal/config/config_test.go`) - 15 tests
  - [x] Test config file loading
  - [x] Test environment variable overrides
  - [x] Test default values
  - [x] Test file type detection (ShouldProcess)
  - [x] Test glob pattern matching

- [x] **DB Client Tests** (`internal/db/client_test.go`) - 17 tests
  - [x] Test Cypher string escaping
  - [x] Test dump mode output
  - [x] Test result parsing (paths, counts)
  - [x] Test UpsertNote/UpsertCode query generation
  - [x] Test special character handling

- [ ] **Integration Tests**
  - [ ] Full scan → query → verify results
  - [ ] Watch mode with test file changes
  - [ ] Dump mode → import → verify graph

---

## Priority 3: Features

### Phase 3: Query Layer (Partially Complete)
- [x] CLI tool for queries
- [x] Orphan/backlink commands
- [ ] Agent integration API (rsrch, angrav can query directly)

### Phase 4: Advanced Features
- [ ] **PDF text extraction** (Zotero integration)
- [ ] **Chat history import** (Gemini conversations)
- [ ] **Semantic search** (embeddings with local model)

### Phase 5: Real-time Sync
- [ ] **Obsidian Plugin** for real-time metadata sync
  - WebSocket connection to daemon
  - Uses Obsidian's metadataCache
- [ ] **WebSocket Ingest Service** (see `docs/architecture_websocket_ingest.md`)

### Phase 6: Validation & Reasoning
- [ ] **Prolog integration** for structural rules (see `docs/vault_validation_spec.md`)
- [ ] `librarian validate` command
- [ ] Rule-based anomaly detection

---

## Backlog / Ideas

- [ ] Multi-vault support (scan multiple independent vaults)
- [ ] Graph visualization web UI
- [ ] Incremental scan (only changed files since last run)
- [ ] Export to other formats (Neo4j, SQLite)
- [ ] GitHub Action for vault validation in CI

---

## Completed ✅

- [x] Go watcher daemon with fsnotify
- [x] Bulk dump mode (sub-second indexing)
- [x] FalkorDB direct sync with connection pool
- [x] Query commands (orphans, backlinks, tags, functions, classes)
- [x] Stats command
- [x] Report generation (HTML/Markdown dashboards)
- [x] Mermaid/PlantUML diagram generation
- [x] Windmill webhook integration (`librarian analyze`)
- [x] Clustering & frontier node visualization
- [x] Benchmarks (Go vs Julia comparison)
