# Vault Librarian - Project Proposal

**Date:** 2025-12-22
**Status:** Draft
**Author:** AI Assistant + User

---

## Executive Summary

A unified knowledge graph system that indexes all vault content (markdown, PDFs, chat histories) and exposes it to multiple agents via FalkorDB. Combines an Obsidian plugin for real-time updates with a file watcher for external edit coverage.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENTS                                  │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐            │
│  │ rsrch   │  │ angrav  │  │ proj    │  │ CLI     │            │
│  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘            │
│       └───────────┴──────┬─────┴────────────┘                   │
│                          ▼                                       │
│              ┌───────────────────────┐                          │
│              │      FalkorDB         │ ◄── Cypher queries       │
│              │   - Notes (nodes)     │                          │
│              │   - Links (edges)     │                          │
│              │   - Tags (labels)     │                          │
│              └───────────────────────┘                          │
│                          ▲                                       │
│           ┌──────────────┴──────────────┐                       │
│           │                             │                        │
│  ┌────────────────┐          ┌────────────────────┐             │
│  │ Obsidian Plugin│          │  File Watcher (Go) │             │
│  │ (TypeScript)   │          │  - inotify         │             │
│  │ - metadataCache│          │  - fallback parser │             │
│  │ - real-time    │          │  - syncs to DB     │             │
│  └────────────────┘          └────────────────────┘             │
│           │                             │                        │
│           └──────────────┬──────────────┘                       │
│                          ▼                                       │
│              ┌───────────────────────┐                          │
│              │   /home/sim/Obsi      │                          │
│              │   (4,339 markdown)    │                          │
│              └───────────────────────┘                          │
└─────────────────────────────────────────────────────────────────┘
```

---

## Components

### 1. Obsidian Bridge Plugin (TypeScript)

**Purpose:** Real-time metadata sync when Obsidian is open

| Feature | Description |
|---------|-------------|
| Event listener | `metadataCache.on('changed')` |
| HTTP API | `GET /notes`, `GET /note/:path` |
| WebSocket | Push updates to watcher |
| Zero parsing | Uses Obsidian's cache |

**Endpoints:**
```
GET  /api/notes              → List all note paths
GET  /api/note/:path         → Full metadata for one note
GET  /api/links/:path        → Backlinks for a note
WS   /api/stream             → Real-time change events
```

**Effort:** ~8-16 hours

---

### 2. File Watcher Daemon (Go)

**Purpose:** Catch edits outside Obsidian, sync to FalkorDB

| Feature | Description |
|---------|-------------|
| inotify | Watch `/home/sim/Obsi` recursively |
| Debouncing | 100ms delay to batch rapid saves |
| Fallback parser | Regex for frontmatter/links |
| FalkorDB client | Upsert nodes on change |

**Key Libraries:**
- `fsnotify` - File watching
- `go-redis` - FalkorDB client (Redis protocol)
- `yaml.v3` - Frontmatter parsing

**Effort:** ~8-12 hours

---

### 3. FalkorDB Schema

```cypher
// Node types
(:Note {
  path: "/path/to/note.md",
  name: "Note Title",
  modified: datetime,
  wordCount: int,
  tags: ["tag1", "tag2"]
})

(:Tag {name: "project"})

// Relationships
(note1)-[:LINKS_TO]->(note2)
(note)-[:TAGGED]->(tag)
(note)-[:EMBEDS]->(note2)
```

**Example Queries:**
```cypher
// Find orphans (no incoming links)
MATCH (n:Note) WHERE NOT ()-[:LINKS_TO]->(n) RETURN n.path

// Find notes related through shared tags
MATCH (a:Note)-[:TAGGED]->(t:Tag)<-[:TAGGED]-(b:Note)
WHERE a.path = $path AND a <> b
RETURN DISTINCT b.path, t.name

// Find shortest path between notes
MATCH p = shortestPath((a:Note)-[:LINKS_TO*]-(b:Note))
WHERE a.name = $from AND b.name = $to
RETURN p
```

---

## Implementation Phases

### Phase 1: Foundation (Week 1)
- [ ] FalkorDB schema design
- [ ] Go watcher daemon (basic)
- [ ] Initial full scan import

### Phase 2: Real-time Sync (Week 2)
- [ ] Go watcher with debouncing
- [ ] Obsidian plugin skeleton
- [ ] Plugin HTTP API

### Phase 3: Query Layer (Week 3)
- [ ] CLI tool for queries
- [ ] Agent integration (rsrch, angrav)
- [ ] Orphan/backlink commands

### Phase 4: Advanced (Week 4+)
- [ ] PDF text extraction (Zotero)
- [ ] Chat history import (Gemini)
- [ ] Semantic search (embeddings)

---

## Technology Decisions

| Component | Choice | Rationale |
|-----------|--------|-----------|
| **Watcher** | Go | Simple, low memory, good fsnotify |
| **Plugin** | TypeScript | Obsidian native |
| **Database** | FalkorDB | Already running, graph model fits |
| **Parser** | Regex | Simple, works, no dependency |
| **CLI** | Go | Compile to single binary |

### Rejected Alternatives

| Option | Why Not |
|--------|---------|
| Rust watcher | Overkill for this scale |
| Julia | Startup time, niche |
| SQLite | No graph queries |
| Neo4j | Heavier than FalkorDB |
| Pure Obsidian | No agent access |

---

## Resource Estimates

### Runtime
| Component | Memory | CPU |
|-----------|--------|-----|
| Go watcher | ~15MB | ~0.1% |
| Obsidian plugin | ~3MB | ~0% |
| FalkorDB | ~100MB | ~1% |

### Development
| Phase | Hours |
|-------|-------|
| Phase 1 | 8-12h |
| Phase 2 | 12-16h |
| Phase 3 | 8-12h |
| Phase 4 | 16-24h |
| **Total** | **44-64h** |

---

## Open Questions

1. **Priority:** Start with watcher-only or plugin-first?
2. **PDF extraction:** Use `pdftotext` or `poppler` bindings?
3. **Embeddings:** Local model or API (OpenAI)?
4. **Multi-vault:** Support `/home/simik/virtualni-zahrada` too?

---

## Next Steps

1. Review and approve this proposal
2. Set up FalkorDB schema
3. Prototype Go watcher
4. Test on 01-pwf vault first
