# Perplexity Researcher - Quick Start Guide

## Docker (Recommended)

**One-time setup:**
```bash
# 1. Build
docker-compose build
```

## Authentication

Authentication is handled via a unified session file stored at `~/.config/perplexity-researcher/auth.json`. This allows you to authenticate once and use the session across CLI, local server, and Docker.

### Option 1: CLI Authentication (Recommended)
Run the following command locally:
```bash
npm run auth
```
This will launch a browser window. Log in to Perplexity, then close the window or press Enter in the terminal to save the session.

### Option 2: Docker Authentication
If you cannot run the CLI locally, you can authenticate via Docker (requires VNC):
```bash
rsrch auth
```
Connect to `localhost:5900` with a VNC viewer to see the browser and log in.

### Option 3: Manual Token
You can also manually place your `auth.json` file in `~/.config/perplexity-researcher/auth.json`.

```bash
# 3. Start
docker-compose up -d
```

**Usage:**
```bash
# Interactive Login (Docker)
rsrch login
# Then open VNC at localhost:5900 to log in manually

# Send query
# Note: This automatically starts the server if not running, 
# and keeps it running for faster subsequent queries.
rsrch query "What is conceptual mapping?" --name=concept-map

# Follow up in the same session
rsrch query "How is it used in education?" --session=concept-map

# Use the latest session
rsrch query "Give me an example" --session=latest

# Batch queries from file
rsrch batch queries.txt

# View browser (VNC)
vncviewer localhost:5900

# NotebookLM Automations
rsrch notebook create "My Research Project"
rsrch notebook add-source "https://example.com/article" --notebook "My Research Project"
rsrch notebook audio --notebook "My Research Project"

# Gemini Deep Research
rsrch gemini deep-research "Quantum Computing Future"
rsrch gemini list-sessions
rsrch gemini list-research-docs 5
rsrch gemini list-research-docs <session-id>
rsrch gemini export-to-docs <session-id>

# OpenAI-Compatible API (use with any OpenAI client)
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"gemini-rsrch","messages":[{"role":"user","content":"Hello!"}]}'

# Streaming (SSE)
curl -N -X POST http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"gemini-rsrch","messages":[{"role":"user","content":"Hello!"}],"stream":true}'

# Available models: gemini-rsrch (streaming), perplexity (no streaming)

# Stop
docker-compose down
```

## Complete Documentation

| Document | Description |
|----------|-------------|
| [CLI.md](./CLI.md) | Complete CLI command reference |
| [API.md](./API.md) | HTTP API reference for server endpoints |
| [USER_GUIDE.md](./USER_GUIDE.md) | User workflows and examples |
| [AGENTS.md](./AGENTS.md) | AI agent integration guide |
