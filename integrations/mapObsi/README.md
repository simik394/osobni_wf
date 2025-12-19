# mapObsi - Obsidian Vault Metadata Mapper

Extracts metadata and stats from Obsidian vault notes into JSON/CSV/SQLite.

## Quick Start

```bash
cd integrations/mapObsi

# Scan changed files (incremental)
make scan

# Scan specific subfolder
make scan VAULT=agents/rsrch

# Full rescan (rebuild from scratch)
make full

# Export to CSV
make csv

# Export to SQLite
make sqlite
```

## What It Extracts

| Category | Properties |
|----------|------------|
| **File** | path, name, size, created, modified |
| **Content** | char_count, word_count, line_count |
| **Structure** | h1-h6 counts, code_blocks, list_items |
| **Obsidian** | frontmatter, tags, wikilinks, embeds |

## Output

All output goes to `output/`:
- `notes.json` - Full data (always generated)
- `notes.csv` - Flat table (`make csv`)
- `vault.db` - SQLite database (`make sqlite`)

## Subvault Selection

```bash
# Only scan a specific folder
make scan VAULT=projects/myproject

# Scan entire vault
make scan VAULT=.
```

## How It Works

1. `detect_changes.sh` - Finds modified files (git status or mtime)
2. `scan.py` - Parses markdown, extracts metadata
3. `output.py` - Converts JSON to CSV/SQLite

Incremental by default - only scans files changed since last run.

## All Commands

```bash
make help      # Show all commands
make scan      # Scan changed files
make full      # Full rescan
make csv       # Export to CSV
make sqlite    # Export to SQLite
make clean     # Delete output files
```
