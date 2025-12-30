# Extensibility Guide: Scanning Non-Obsidian Locations

Vault Librarian is designed to scan Obsidian vaults, but its architecture supports indexing **any directory** containing markdown files or source code. This guide explains how to configure it for non-Obsidian locations.

---

## Quick Start: Adding a New Source

Edit your config file (`~/.config/librarian/config.yaml`):

```yaml
sources:
  # Your Obsidian vault (default)
  - name: "obsidian-vault"
    path: "~/Obsi"
    enabled: true
    priority: 1

  # Add a code project
  - name: "my-project"
    path: "~/Projects/my-project"
    enabled: true
    priority: 2

  # Add documentation folder
  - name: "company-docs"
    path: "/shared/docs"
    enabled: true
    priority: 3
```

Then run:
```bash
./librarian scan
```

---

## Source Configuration Options

Each source supports these options:

| Option | Type | Description |
|--------|------|-------------|
| `name` | string | Identifier for the source (shown in logs) |
| `path` | string | Directory path (supports `~` expansion) |
| `enabled` | bool | Whether to scan this source |
| `priority` | int | Order of scanning (lower = first) |

---

## Example Use Cases

### 1. Monorepo with Multiple Projects

```yaml
sources:
  - name: "frontend"
    path: "~/work/monorepo/packages/frontend"
    enabled: true

  - name: "backend"
    path: "~/work/monorepo/packages/backend"
    enabled: true

  - name: "shared-libs"
    path: "~/work/monorepo/packages/shared"
    enabled: true
```

### 2. Mixed Vault + External Docs

```yaml
sources:
  - name: "personal-vault"
    path: "~/Obsi/Personal"
    enabled: true

  - name: "work-vault"
    path: "~/Obsi/Work"
    enabled: true

  - name: "external-wiki"
    path: "/mnt/shared/company-wiki"
    enabled: true
```

### 3. Code-Only Analysis (No Markdown)

Disable markdown processing and only scan code:

```yaml
sources:
  - name: "codebase"
    path: "~/Projects/app"
    enabled: true

processing:
  markdown:
    enabled: false   # Disable markdown
  code:
    enabled: true
  assets:
    enabled: false
```

---

## Customizing File Type Detection

Control which files are processed as code:

```yaml
processing:
  code:
    extensions:
      - ".py"
      - ".go"
      - ".ts"
      - ".js"
      - ".rs"
      - ".jl"
      - ".rb"      # Add Ruby
      - ".php"     # Add PHP
      - ".java"    # Add Java
    enabled: true
    exclude:
      - "**/node_modules/**"
      - "**/.venv/**"
      - "**/vendor/**"
      - "**/dist/**"
      - "**/build/**"
```

---

## Project Detection

Librarian can automatically group files into projects. Configure `project_roots`:

```yaml
project_roots:
  - "Prods"        # ~/Obsi/Prods/* are projects
  - "Projects"     # ~/Projects/* are projects
  - "work"         # ~/work/* are projects
```

Files under these roots will be linked to `:Project` nodes in the graph:

```cypher
(:Project {name: "my-app"})-[:CONTAINS]->(:Code {path: "..."})
```

---

## Filtering with Include/Exclude

Fine-grained control over which files are processed:

### Include Only Specific Paths

```yaml
processing:
  code:
    include:
      - "**/src/**"      # Only scan src directories
      - "**/lib/**"      # And lib directories
    exclude: []
```

### Exclude Specific Paths

```yaml
processing:
  code:
    include: []          # Empty = include all
    exclude:
      - "**/test/**"
      - "**/tests/**"
      - "**/*_test.go"
      - "**/*.spec.ts"
```

### Global Ignores

Files matching these patterns are always skipped:

```yaml
global_ignore:
  patterns:
    - "**/.git/**"
    - "**/.obsidian/**"
    - "**/.trash/**"
    - "**/node_modules/**"
    - "**/__pycache__/**"
    - "**/.venv/**"
  max_file_size: 10485760  # 10MB
```

---

## Environment Variables

Override config via environment:

```bash
# Add a source
export VAULT_PATH=/path/to/source

# Multiple sources require config file
# (env var only sets the first source)
```

---

## Verification

After configuring, verify your sources are detected:

```bash
# See what would be scanned
./librarian scan --dry-run

# Scan and check stats
./librarian scan
./librarian stats
```

---

## Common Patterns

### Documentation Sites (Docusaurus, MkDocs, etc.)

```yaml
sources:
  - name: "docs-site"
    path: "~/docs-site/docs"  # Only the docs folder
    enabled: true

processing:
  markdown:
    extensions: [".md", ".mdx"]  # Include MDX
    enabled: true
  code:
    enabled: false  # Skip JS/config files
```

### Zettelkasten in Plain Text

```yaml
sources:
  - name: "zettelkasten"
    path: "~/zk"
    enabled: true

processing:
  markdown:
    extensions: [".md", ".txt"]  # Include .txt
    enabled: true
```

### Research Papers (LaTeX + Markdown)

```yaml
sources:
  - name: "research"
    path: "~/research"
    enabled: true

processing:
  markdown:
    extensions: [".md"]
    enabled: true
  code:
    extensions: [".tex", ".bib"]  # Treat as "code" for linking
    enabled: true
```

---

## Limitations

1. **No recursive source nesting**: If source A contains source B, files may be indexed twice
2. **Path uniqueness**: Each file path should be unique across all sources
3. **Watch mode**: Only watches enabled sources; adding a new source requires restart

---

## Next Steps

- [[SCHEMA|Schema Documentation]] — Understanding the graph structure
- [[GETTING_STARTED|Getting Started]] — Basic setup and usage
- [[BENCHMARKS]] — Performance expectations
