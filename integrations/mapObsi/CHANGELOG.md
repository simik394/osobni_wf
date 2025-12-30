# Changelog

All notable changes to Vault Librarian are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [Unreleased]

### Added
- Comprehensive documentation suite:
  - [[GETTING_STARTED|GETTING_STARTED.md]] — Quick setup guide
  - [[SCHEMA|SCHEMA.md]] — FalkorDB graph schema documentation
  - [[EXTENSIBILITY|EXTENSIBILITY.md]] — Guide for non-Obsidian sources
  - [[Prods/01-pwf/integrations/mapObsi/TODO|TODO.md]] — Project roadmap
  - [[Prods/01-pwf/integrations/mapObsi/CHANGELOG|CHANGELOG.md]] — This file
- Unit test suite for Go implementation:
  - `internal/parser/parser_test.go` — 14 tests for markdown/code parsing
  - `internal/config/config_test.go` — 15 tests for configuration
  - `internal/db/client_test.go` — 17 tests for DB client and Cypher generation
- Updated README with clearer project overview and feature matrix

### Changed
- Improved project structure documentation

---

## [1.0.0] - 2025-12-22

### Added
- **Go Implementation** (Production Ready)
  - `librarian scan` — Full vault indexing
  - `librarian scan --dump` — Fast bulk Cypher export (0.42s for ~4000 files)
  - `librarian watch` — Real-time file watching with fsnotify
  - `librarian query orphans` — Find notes with no incoming links
  - `librarian query backlinks <note>` — Find notes linking to a target
  - `librarian query tags <tag>` — Find notes with specific tag
  - `librarian query functions <name>` — Find function definitions
  - `librarian query classes <name>` — Find class/struct definitions
  - `librarian stats` — Graph statistics
  - `librarian report` — Generate architecture diagrams (Mermaid/PlantUML)
  - `librarian analyze` — Trigger Windmill AI analysis workflow

- **FalkorDB Integration**
  - Node types: Note, Code, Tag, Function, Class, Module, Project, Task
  - Relationship types: LINKS_TO, EMBEDS, TAGGED, DEFINES, IMPORTS, CONTAINS, HAS_TASK
  - Automatic index creation for fast lookups

- **Multi-Language Code Parsing**
  - Python, Go, TypeScript, JavaScript, Rust, Julia
  - Tree-sitter integration with regex fallback
  - Function, class, and import extraction
  - TODO/FIXME/NOTE task detection

- **Report Generation**
  - HTML dashboards with interactive Mermaid diagrams
  - Markdown reports for Obsidian/IDE viewing
  - PlantUML architecture diagrams
  - Automatic clustering by directory
  - Frontier node detection for context

- **Configuration**
  - YAML config file support (`~/.config/librarian/config.yaml`)
  - Environment variable overrides
  - Multiple source directories
  - Customizable file type rules
  - Global ignore patterns

- **Julia Implementation** (Benchmark/Analysis)
  - Parallel regex parsing
  - Raw TCP database sync
  - Performance: 0.35s dump mode

- **Python Implementation** (Legacy)
  - Tree-sitter-based parsing
  - Reference implementation

### Documentation
- [[VAULT_LIBRARIAN_PROPOSAL|VAULT_LIBRARIAN_PROPOSAL.md]] — Original design document
- [[BENCHMARKS|BENCHMARKS.md]] — Go vs Julia performance comparison
- [[DIAGRAMS|DIAGRAMS.md]] — Report generation guide
- [[vault_validation_spec|vault_validation_spec.md]] — Future validation system spec
- [[architecture_websocket_ingest|architecture_websocket_ingest.md]] — WebSocket scaling proposal

---

## [0.1.0] - 2025-12-15

### Added
- Initial Python prototype
- Basic markdown parsing with Tree-sitter
- FalkorDB integration proof-of-concept
- Wikilink and tag extraction
