# Rsrch Server Deployment Guide

## Quick Start

```bash
# Build
cd agents/rsrch && npm run build

# Run (foreground)
PORT=3001 node dist/server.js

# Run (background)
PORT=3001 node dist/server.js &
```

## Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/query` | POST | Run Perplexity query |
| `/notebook/create` | POST | Create NotebookLM notebook |
| `/notebook/generate-audio` | POST | Generate audio (async job) |
| `/jobs/:id` | GET | Check job status |
| `/gemini/research` | POST | Start Gemini deep research |

## Example Query

```bash
curl -X POST http://localhost:3001/query \
  -H "Content-Type: application/json" \
  -d '{"query": "What is quantum computing?"}'
```

---

## Systemd Service (Persistent)

```bash
# Install
sudo cp rsrch-server@.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now rsrch-server@$USER

# Status
sudo systemctl status rsrch-server@$USER

# Logs
journalctl -u rsrch-server@$USER -f
```

---

## Known Issues

| Issue | Solution |
|-------|----------|
| Profile locked | Stop other Chromium instances, delete `~/.config/rsrch/user-data/SingletonLock` |
| Docker browser conflict | Use local deployment OR stop Docker chromium containers |
| Port already in use | Change `PORT=3002` or kill existing process |

---

## Docker (Alternative)

```bash
# Start with FalkorDB only (use host browser)
docker compose up -d falkordb

# Build and run server container
docker compose build perplexity-server
docker compose up -d perplexity-server

# Note: Requires angrav-browser or rsrch-chromium running on port 9223
```

---

## Job Queue (FalkorDB)

Jobs are stored in FalkorDB for async processing.

```bash
# Start FalkorDB
docker compose up -d falkordb

# Submit async job
curl -X POST http://localhost:3001/query \
  -H "Content-Type: application/json" \
  -d '{"query": "AI trends 2025", "deepResearch": true}'

# Response: {"jobId": "abc123", "statusUrl": "/jobs/abc123"}

# Check status
curl http://localhost:3001/jobs/abc123
```

**Job Statuses:** `queued` → `running` → `completed` | `failed`

---

## Notifications

Supports **ntfy.sh** and **Discord webhooks**.

```bash
# Setup
export NTFY_TOPIC="your-topic-name"
# OR
export DISCORD_WEBHOOK="https://discord.com/api/webhooks/..."

# Send notification
rsrch notify "Research complete!" --title "Rsrch"

# Watcher with notifications
rsrch watch --queue  # Notifies when research completes
```

See [[ntfy-guide|ntfy-guide.md]] for detailed setup.
