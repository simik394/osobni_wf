# mapObsi — Vault Librarian

> **Scan your Obsidian vault. Query it like a knowledge graph. Get precise project state.**

Vault Librarian indexes your Obsidian vault (and code directories) into [FalkorDB](https://www.falkordb.com/), enabling graph-based queries, architecture visualization, and AI-powered analysis.

## ✨ Features

| Feature | Description |
|---------|-------------|
| **📊 Graph Queries** | Find orphan notes, backlinks, tag relationships |
| **🔍 Code Analysis** | Index functions, classes, imports from code files |
| **📈 Architecture Reports** | Generate Mermaid/PlantUML diagrams |
| **👁️ Live Watching** | Keep graph in sync as you edit |
| **🤖 AI Analysis** | Trigger Windmill workflows for insights |
| **⚡ Fast** | ~4,000 files indexed in 0.4 seconds |

## 🚀 Quick Start

```bash
# Build
cd implementations/go
go build -o librarian ./cmd/librarian

# Index your vault (fastest method)
./librarian scan --dump
cat dump.cypher | redis-cli --pipe

# Query
./librarian query orphans          # Find orphan notes
./librarian query backlinks README # Find what links to a note
./librarian stats                  # Graph statistics
```

**📖 [Full Getting Started Guide →](docs/GETTING_STARTED.md)**

## 📁 Project Structure

```
mapObsi/
├── docs/                      # Documentation
│   ├── GETTING_STARTED.md     # ← Start here
│   ├── BENCHMARKS.md          # Performance comparison
│   └── vault_validation_spec.md
├── implementations/
│   ├── go/                    # ✅ RECOMMENDED - Production daemon
│   ├── julia/                 # Benchmark/analysis tool
│   └── python/                # Legacy prototype
├── TODO.md                    # Project roadmap
└── README.md                  # This file
```

## 🏗️ Implementations

| Implementation | Status | Performance | Use Case |
|----------------|--------|-------------|----------|
| **[Go](implementations/go/)** | ✅ Production | 0.42s dump, 3s sync | Daily use, watching |
| **[Julia](implementations/julia/)** | ⚠️ Benchmark | 0.35s dump, 14s sync | Analysis, prototyping |
| **[Python](implementations/python/)** | 🗄️ Legacy | Slower | Reference only |

**[See Full Benchmark Report →](docs/BENCHMARKS.md)**

## 📚 Documentation

- **[Getting Started](docs/GETTING_STARTED.md)** — Setup, configuration, CLI reference
- **[Go Implementation](implementations/go/README.md)** — Detailed daemon documentation
- **[Diagram Generation](implementations/go/DIAGRAMS.md)** — Clustering & visualization logic
- **[Benchmarks](docs/BENCHMARKS.md)** — Performance comparison (Go vs Julia)
- **[Validation Spec](docs/vault_validation_spec.md)** — Future: Prolog-based rule validation
- **[Project Proposal](VAULT_LIBRARIAN_PROPOSAL.md)** — Original design document

## 🗺️ Roadmap

See [TODO.md](TODO.md) for detailed tracking. Priorities:

1. **Documentation** — Schema docs, extensibility guide
2. **Testing** — Unit tests for Go implementation
3. **Features** — PDF extraction, semantic search, Obsidian plugin

## 🔧 Requirements

- **Go 1.21+** for building
- **FalkorDB** running on port 6379
- **redis-cli** for bulk import

```bash
# Start FalkorDB
docker run -d --name falkordb -p 6379:6379 falkordb/falkordb
```
