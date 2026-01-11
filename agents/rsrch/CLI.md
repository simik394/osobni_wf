# rsrch CLI Reference

Complete command reference for the rsrch command-line tool.

## Installation

```bash
cd agents/rsrch
npm install
npm run build
```

Or use the pre-built binary:
```bash
./rsrch-bin --help
```

---

## Authentication

```bash
rsrch auth              # Interactive browser login
rsrch login             # Docker VNC-based login
```

---

## Perplexity Commands

### Query
```bash
rsrch query "Your question"
rsrch query "Follow up" --session=latest       # Continue session
rsrch query "Topic" --name=my-session          # Named session
rsrch query "Complex topic" --deep              # Deep research mode
rsrch query "Question" --local                  # Local browser (not server)
```

### Batch
```bash
rsrch batch queries.txt                         # Run queries from file
```

---

## Gemini Commands

### Research
```bash
rsrch gemini research "Query" [--local]
rsrch gemini deep-research "Query" [--gem="Gem Name"] [--local] [--headed]
```

### Sessions
```bash
rsrch gemini list-sessions [Limit] [Offset] [--local]
rsrch gemini open-session "SessionID" [--local] [--headed]
rsrch gemini get-response [SessionID] [Index] [--local]
rsrch gemini get-responses [SessionID] [--local]
rsrch gemini send-message [SessionID] "Message" [--local] [--headed]
```

### Research Documents
```bash
rsrch gemini list-research-docs [Limit | SessionID] [--local]
rsrch gemini get-research-info [SessionID] [--local]
rsrch gemini export-to-docs [SessionID] [--local] [--headed]
```

### File Upload
```bash
rsrch gemini upload-file "/path/to/file" [SessionID] [--local]
rsrch gemini upload-files "file1" "file2" ... [--local]
rsrch gemini upload-repo "https://github.com/..." --branch=main [SessionID] [--local]
```

### Gems (Custom Assistants)
```bash
rsrch gemini list-gems [--local]
rsrch gemini open-gem "GemNameOrID" [--local]
rsrch gemini create-gem "Name" --instructions "System prompt" [--file /path] [--config /path] [--local]
rsrch gemini chat-gem "GemNameOrID" "Message" [--local]
```

### Sync
```bash
rsrch gemini sync-conversations [--limit=N] [--offset=M] [--local]
```

---

## NotebookLM Commands

### Notebooks
```bash
rsrch notebook create "Title"
rsrch notebook list [--local]
rsrch notebook stats "Title" [--local]
rsrch notebook artifacts "Title" [--local]
```

### Sources
```bash
rsrch notebook add-source "URL" --notebook "Title"
rsrch notebook add-drive-source "DocName1,DocName2" --notebook "Title"
rsrch notebook add-text "Notebook Title" "Content or @file.txt" --source-title "Title"
rsrch notebook sources "Title" [--local]
rsrch notebook sources-without-audio --notebook "Title"
rsrch notebook messages "Title" [--local]
```

### Audio
```bash
# Generate audio for sources
rsrch notebook audio --notebook "Title" [--source "Source Name"] [--prompt "Custom Prompt"] [--wet] [--force]

# Check Generation Status
rsrch notebook audio-status --notebook "Title"

# Download Audio
rsrch notebook download-audio "audio.mp3" --notebook "Title" [--latest] [--pattern "regex"]
rsrch notebook download-all-audio ./output --notebook "Title" [--limit=N]
rsrch notebook download-batch-audio --titles "Title1,Title2" --output ./output
```

### Sync
```bash
rsrch notebook sync [--title "Title"] [--audio] [--local]
```

---

## Graph Commands

### Status
```bash
rsrch graph status                              # Connection status
rsrch graph notebooks [--limit=N]               # List synced notebooks
rsrch graph conversations [--limit=N] [--local] # List synced conversations
rsrch graph jobs [status]                       # List jobs (queued, running, etc)
```

### Exploration
```bash
rsrch graph conversation <ID> [--questions-only] [--answers-only] [--research-docs]
rsrch graph lineage <ArtifactID>                # Show lineage (Job -> Session -> Doc -> Audio)
```

### Export
```bash
rsrch graph export [--platform=gemini|perplexity] [--format=md|json] [--output=path] [--since=date] [--limit=N]
```

### Citations
```bash
rsrch graph citations [--domain=example.com] [--limit=N]
rsrch graph citation-usage <url>
rsrch graph migrate-citations                   # Migrate ResearchDocs to Citation nodes
```

---

## Registry Commands

Artifact registry for research sessions and documents.

```bash
rsrch registry list                             # List all artifacts
rsrch registry list --type=session              # Filter by type
rsrch registry list --type=document
rsrch registry list --type=audio
rsrch registry show <ID>                        # Show artifact details
rsrch registry lineage <ID>                     # Show parent chain
```

---

## Monitoring & Automation

### Watcher
```bash
# Watch for new research and auto-process
rsrch watch [--audio] [--queue] [--folder /path/to/audio] [--once]
```

### Notifications
```bash
rsrch notify "Message" --title "Title" --priority default
```

### Unified Pipeline
```bash
rsrch unified "Query" [--prompt "custom prompt"] [--dry-run]
```

---

## Server Commands

```bash
rsrch serve                                     # Start HTTP server
rsrch serve --port 8080                         # Custom port
rsrch stop                                      # Stop server
```

---

## Flags Reference

| Flag | Description |
|------|-------------|
| `--local` | Use local browser instead of server (Default for most commands) |
| `--headed` | Show browser window (default: headless) |
| `--session=ID` | Continue existing session |
| `--name=NAME` | Create named session |
| `--deep` | Enable deep research mode (Perplexity) |
| `--gem="Name"` | Use specific Gem (Gemini) |
| `--dry-run` | Simulate without side effects |
| `--wet` | Execute with side effects (e.g. consume audio quota) |
| `--notebook="Title"` | Specify target NotebookLM notebook |

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | HTTP server port |
| `HEADLESS` | `false` | Run browser headless |
| `BROWSER_CDP_ENDPOINT` | - | Remote browser CDP URL |
| `BROWSER_WS_ENDPOINT` | - | Remote browser WebSocket URL |
| `FALKORDB_HOST` | `localhost` | Graph database host |
| `FALKORDB_PORT` | `6379` | Graph database port |
| `NTFY_SERVER` | `https://ntfy.sh` | Ntfy server for notifications |
| `NTFY_TOPIC` | `rsrch-audio` | Ntfy topic |

---

## Examples

### Research Workflow
```bash
# 1. Start deep research
rsrch gemini deep-research "AI in Healthcare" --local

# 2. Export to Google Docs
rsrch gemini export-to-docs --local

# 3. Create NotebookLM podcast
rsrch notebook create "AI Healthcare Research"
rsrch notebook add-source "https://docs.google.com/..." --notebook "AI Healthcare Research"
rsrch notebook audio --notebook "AI Healthcare Research" --wet
```

### Gem Workflow
```bash
# 1. Create custom assistant
rsrch gemini create-gem "Research Helper" \
  --instructions "You are a research assistant specializing in technology trends" \
  --config ./gem_config.yaml \
  --local

# 2. Chat with gem
rsrch gemini chat-gem "Research Helper" "What are the latest AI developments?" --local

# 3. Deep Research with Gem
rsrch gemini deep-research "Quantum Computing" --gem "Research Helper" --local
```

### Repo Upload
```bash
# Upload a git repository context to a session (or new session)
rsrch gemini upload-repo https://github.com/example/repo --branch=main --local
```

### Graph Export
```bash
# Export all Gemini conversations as markdown
rsrch graph export --platform=gemini --format=md --output=./exports --limit=50
```
