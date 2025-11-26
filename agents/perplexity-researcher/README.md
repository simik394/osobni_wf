# Perplexity Researcher - Quick Start Guide

## Docker (Recommended)

**One-time setup:**
```bash
# 1. Build
docker-compose build

# 2. Authenticate (opens browser, log in, close window)
docker-compose run --rm perplexity-server npm run auth

# 3. Start
docker-compose up -d
```

**Usage:**
```bash
# Send query
curl -X POST http://localhost:3000/query \
  -H "Content-Type: application/json" \
  -d '{"query":"Your question here"}'

# View browser (VNC)
vncviewer localhost:5900

# Stop
docker-compose down
```

## Complete Documentation

- **[API.md](file:///home/sim/Obsi/Prods/01-pwf/agents/perplexity-researcher/API.md)** - Full API reference, Docker guide, examples, troubleshooting
- **[walkthrough.md](file:///home/sim/.gemini/antigravity/brain/9d2ab7d5-cb3e-4a79-9ec5-140398ded8e2/walkthrough.md)** - Implementation overview and architecture
