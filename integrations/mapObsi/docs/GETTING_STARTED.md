# Getting Started with Vault Librarian

> **TL;DR**: Scan your Obsidian vault into FalkorDB and query it like a knowledge graph.

## What is Vault Librarian?

Vault Librarian indexes your Obsidian vault (and other directories) into [FalkorDB](https://www.falkordb.com/), a graph database. This enables:

- **Graph queries**: Find orphan notes, backlinks, tag relationships
- **Architecture reports**: Generate visual diagrams of code dependencies
- **AI analysis**: Trigger Windmill workflows for AI-powered project insights
- **Live watching**: Keep the graph in sync as you edit files

---

## Prerequisites

| Requirement | Version | Check Command |
|-------------|---------|---------------|
| Go | 1.21+ | `go version` |
| FalkorDB | Latest | `docker ps \| grep falkor` |
| Redis CLI | Any | `redis-cli --version` |

### Start FalkorDB

```bash
docker run -d --name falkordb -p 6379:6379 falkordb/falkordb
```

---

## Quick Start (5 minutes)

### 1. Build the Librarian

```bash
cd integrations/mapObsi/implementations/go
go build -o librarian ./cmd/librarian
```

### 2. Configure

```bash
# Create config directory
mkdir -p ~/.config/librarian

# Copy example config
cp config.example.yaml ~/.config/librarian/config.yaml

# Edit to point to your vault
vim ~/.config/librarian/config.yaml
```

**Minimal config changes:**
```yaml
sources:
  - name: "My Vault"
    path: "/path/to/your/Obsi"  # ← Change this
    enabled: true
```

Or use environment variables:
```bash
export VAULT_PATH=~/Obsi
export FALKORDB_ADDR=localhost:6379
```

### 3. Index Your Vault (Fastest Method)

```bash
# Generate Cypher file (sub-second for ~4000 files)
./librarian scan --dump

# Import to FalkorDB
cat dump.cypher | redis-cli -p 6379 --pipe
```

### 4. Query Your Knowledge Graph

```bash
# Find orphan notes (no incoming links)
./librarian query orphans

# Find what links to a specific note
./librarian query backlinks "My Project"

# Find notes with a tag
./librarian query tags project

# Get graph statistics
./librarian stats
```

---

## Common Workflows

### Workflow 1: Initial Setup + Live Watching

```bash
# First-time full index
./librarian scan --dump && cat dump.cypher | redis-cli --pipe

# Start watching for changes (runs in foreground)
./librarian watch
```

### Workflow 2: Generate Architecture Report

```bash
# Analyze a specific code directory
./librarian report agents/rsrch ./report-output --detail medium

# Open the generated dashboard
xdg-open ./report-output/index.html
```

### Workflow 3: AI-Powered Project Analysis

Requires Windmill webhook configuration in `config.yaml`:

```yaml
windmill:
  webhook_url: "https://your-windmill/api/w/workspace/..."
  token: "your-token"
```

Then:
```bash
./librarian analyze my-project-name
```

---

## CLI Reference

| Command | Description | Example |
|---------|-------------|---------|
| `scan` | Full vault scan | `./librarian scan` |
| `scan --dump` | Fast bulk export | `./librarian scan --dump` |
| `watch` | Live file watching | `./librarian watch` |
| `query orphans` | Notes with no incoming links | `./librarian query orphans` |
| `query backlinks <note>` | Find what links to a note | `./librarian query backlinks README` |
| `query tags <tag>` | Find notes with tag | `./librarian query tags project` |
| `query functions <name>` | Find function definitions | `./librarian query functions handleClick` |
| `stats` | Graph statistics | `./librarian stats` |
| `report <path> <out>` | Generate diagrams | `./librarian report src/ ./out` |
| `analyze <project>` | Trigger AI analysis | `./librarian analyze 01-pwf` |

---

## Configuration Deep Dive

The config file (`~/.config/librarian/config.yaml`) has these sections:

### Sources (What to scan)

```yaml
sources:
  - name: "Obsidian Vault"
    path: "/home/user/Obsi"
    enabled: true
  - name: "Code Projects"
    path: "/home/user/Projects"
    enabled: true
```

### Processing (How to handle files)

```yaml
processing:
  markdown:
    extensions: [".md"]
    extract_frontmatter: true
    extract_links: true
    extract_tags: true
  code:
    extensions: [".py", ".ts", ".go", ".rs"]
    extract_definitions: true
```

### Database

```yaml
database:
  address: "localhost:6379"
  graph_name: "vault"
  pool_size: 10
```

### Global Ignores

```yaml
global_ignore:
  patterns:
    - "node_modules"
    - ".git"
    - "__pycache__"
    - "*.min.js"
```

See [config.example.yaml](file:///home/sim/Obsi/Prods/01-pwf/integrations/mapObsi/implementations/go/config.example.yaml) for full reference.

---

## FalkorDB Schema

The librarian creates these node types:

| Node Label | Properties | Description |
|------------|------------|-------------|
| `:Note` | `path`, `name`, `modified`, `tags[]` | Markdown files |
| `:Code` | `path`, `name`, `language`, `functions[]`, `classes[]` | Code files |
| `:Tag` | `name` | Unique tags |
| `:Project` | `name`, `path` | Project roots |

### Relationships

| Relationship | Description |
|--------------|-------------|
| `(:Note)-[:LINKS_TO]->(:Note)` | Wikilink references |
| `(:Note)-[:TAGGED]->(:Tag)` | Tag assignments |
| `(:Code)-[:IMPORTS]->(:Code)` | Import statements |
| `(:Code)-[:DEFINES]->(:Function)` | Function definitions |
| `(:Project)-[:CONTAINS]->(:Note\|:Code)` | Project membership |

### Example Cypher Queries

```cypher
-- Find all orphan notes (no incoming links)
MATCH (n:Note) WHERE NOT ()-[:LINKS_TO]->(n) RETURN n.path

-- Find notes related through shared tags
MATCH (a:Note)-[:TAGGED]->(t:Tag)<-[:TAGGED]-(b:Note)
WHERE a.path = '/path/to/note.md' AND a <> b
RETURN DISTINCT b.path, t.name

-- Find shortest path between two notes
MATCH p = shortestPath((a:Note)-[:LINKS_TO*]-(b:Note))
WHERE a.name = 'Start' AND b.name = 'End'
RETURN p
```

---

## Troubleshooting

### "Connection refused" to FalkorDB

```bash
# Start the database
docker run -d --name falkordb -p 6379:6379 falkordb/falkordb

# Verify it's running
redis-cli -p 6379 PING
# Should return: PONG
```

### No files being scanned

1. Check your `sources[].path` in config
2. Ensure `sources[].enabled: true`
3. Check `global_ignore.patterns` isn't too aggressive

### Slow scan performance

Use dump mode for bulk indexing:
```bash
./librarian scan --dump
cat dump.cypher | redis-cli --pipe
```

This is ~10x faster than direct sync.

---

## Next Steps

- **[[SCHEMA|Schema Documentation]]** — Full graph schema, node types, and 15+ example queries
- **[[EXTENSIBILITY|Extensibility Guide]]** — Scan non-Obsidian directories
- **[Architecture docs](file:///home/sim/Obsi/Prods/01-pwf/integrations/mapObsi/implementations/go/README.md#architecture)** — Internal code structure
- **[Diagram generation](file:///home/sim/Obsi/Prods/01-pwf/integrations/mapObsi/implementations/go/DIAGRAMS.md)** — Report generation details
- **[[BENCHMARKS]]** — Go vs Julia performance comparison
