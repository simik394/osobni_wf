# Vault Librarian (Go)

> A high-performance daemon that indexes your Obsidian vault into FalkorDB for graph-based queries.

## Quick Start

### 1. Build

```bash
cd implementations/go
go build -o librarian ./cmd/librarian
```

### 2. Configure

```bash
# Copy example config
mkdir -p ~/.config/librarian
cp config.example.yaml ~/.config/librarian/config.yaml

# Edit paths and settings
vim ~/.config/librarian/config.yaml
```

Or use environment variables:
```bash
export VAULT_PATH=~/Obsi
export FALKORDB_ADDR=localhost:6379
export FALKORDB_GRAPH=vault
```

### 3. Run

```bash
# Initial scan (fastest method - outputs Cypher file)
./librarian scan --dump
cat dump.cypher | redis-cli -p 6379 --pipe

# Or direct sync (slower but immediate)
./librarian scan

# Start watching for changes
./librarian watch
```

---

## CLI Commands

### `watch` - Live File Watching

Monitors the vault for changes and syncs to FalkorDB in real-time.

```bash
./librarian watch
```

Uses `fsnotify` with 100ms debouncing by default.

---

### `scan` - Index Vault

Performs a full or partial scan of the vault.

```bash
# Full scan - direct to database
./librarian scan

# Scan specific folder
./librarian scan agents/

# Dump mode - fastest, outputs Cypher file
./librarian scan --dump
```

**Performance** (4,000 files):
- Dump mode: ~0.42s
- Direct sync: ~3.0s (parallel with connection pool)

---

### `query` - Search the Graph

Query the indexed knowledge graph.

```bash
# Find orphan notes (no incoming links)
./librarian query orphans

# Find notes linking to a specific note
./librarian query backlinks "My Note"

# Find notes with a tag
./librarian query tags project

# Find function definitions (in code files)
./librarian query functions myFunction

# Find class definitions
./librarian query classes MyClass
```

---

### `stats` - Graph Statistics

Display counts of nodes and relationships.

```bash
./librarian stats
# Graph Statistics:
#   Notes: 4339
#   Links: 12453
#   Tags:  847
```

---

### `analyze` - AI Analysis (Windmill)

Trigger a Windmill webhook for AI-powered project analysis.

```bash
./librarian analyze 01-pwf
```

Requires `windmill.webhook_url` in config. See [[#windmill-integration|Windmill Integration]].

---

## Configuration

The librarian reads config from:
1. `$LIBRARIAN_CONFIG` (environment variable)
2. `~/.config/librarian/config.yaml`
3. Built-in defaults

### Key Configuration Sections

| Section | Purpose |
|---------|---------|
| `sources` | Vault paths to index |
| `processing` | File type rules (markdown, code, assets) |
| `database` | FalkorDB connection settings |
| `watcher` | Debounce and realtime settings |
| `global_ignore` | Patterns to skip everywhere |
| `project_roots` | Directories containing projects |
| `windmill` | AI analysis webhook settings |

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `VAULT_PATH` | Primary vault location | `~/Obsi` |
| `FALKORDB_ADDR` | Database address | `localhost:6379` |
| `FALKORDB_GRAPH` | Graph name | `vault` |
| `WINDMILL_WEBHOOK_URL` | Analysis webhook | (none) |
| `WINDMILL_TOKEN` | Bearer token for webhook | (none) |

See [config.example.yaml](file:///home/sim/Obsi/Prods/01-pwf/integrations/mapObsi/implementations/go/config.example.yaml) for full reference.

---

## Architecture

```
cmd/librarian/main.go     # CLI entry point
internal/
├── config/config.go      # Configuration loading and defaults
├── db/client.go          # FalkorDB client (Cypher queries)
├── parser/parser.go      # Markdown/code parsing (frontmatter, links, tags)
└── watcher/watcher.go    # fsnotify integration, file processing
```

### Data Flow

```
┌─────────────────┐    ┌──────────────┐    ┌─────────────┐
│  Vault Files    │ → │   Parser     │ → │  FalkorDB   │
│  (.md, .py, etc)│    │  (regex)     │    │  (Cypher)   │
└─────────────────┘    └──────────────┘    └─────────────┘
         ↑                                        │
         │                                        ↓
    ┌────────────┐                     ┌──────────────────┐
    │  fsnotify  │                     │  Query Results   │
    │  (watch)   │                     │  (orphans, etc)  │
    └────────────┘                     └──────────────────┘
```

---

## Windmill Integration

The `analyze` command triggers AI analysis via Windmill webhooks.

1. Configure webhook in `config.yaml`:
   ```yaml
   windmill:
     webhook_url: "https://windmill.example.com/api/w/workspace/jobs/run_wait_result/p/f/project/analyze"
     token: "your-api-token"
   ```

2. Trigger analysis:
   ```bash
   ./librarian analyze my-project
   ```

This sends a JSON payload with the project name and path to your configured Windmill flow.

---

## Visualization & Reporting

Librarian includes a powerful reporting engine that generates HTML and Markdown dashboards summarizing your codebase architecture.

- **Advanced Clustering**: Large diagrams are automatically split by directory to maintain readability.
- **Frontier Detection**: Contextual view of internal/external dependencies (1-hop external connections).
- **Multiple Formats**: HTML dashboard (with Mermaid.js), Markdown report, and raw PlantUML/DOT files.

See [[DIAGRAMS|DIAGRAMS.md]] for a detailed technical breakdown of how these diagrams are generated and structured.

---

## Troubleshooting

### Connection Refused to FalkorDB

```
Failed to connect to FalkorDB: dial tcp [::1]:6379: connect: connection refused
```

**Solution**: Start FalkorDB:
```bash
docker run -d -p 6379:6379 falkordb/falkordb
```

### No Files Processed

Check:
1. `sources[0].path` points to your vault
2. `sources[0].enabled` is `true`
3. Files aren't in `global_ignore.patterns`

### Slow Scan Performance

Use dump mode for fastest initial indexing:
```bash
./librarian scan --dump
cat dump.cypher | redis-cli -p 6379 --pipe
```

### Windmill Webhook Fails

Ensure:
1. `windmill.webhook_url` is set
2. `windmill.token` has correct permissions
3. Network can reach the Windmill instance
