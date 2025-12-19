# questDiscov

Research question prioritization agent using LangGraph + Gemini + FalkorDB.

## Quick Start

```bash
# Install dependencies
cd agents/questDiscov
pip install -e .

# Set up environment
cp .env.example .env
# Edit .env with your API keys

# Start FalkorDB (reuses rsrch setup)
docker compose -f ../rsrch/docker-compose.yml up falkordb -d

# Run CLI
questDiscov status
questDiscov add "What is the optimal temperature for reaction X?"
questDiscov prioritize
```

## Commands

| Command | Description |
|---------|-------------|
| `questDiscov status` | Show graph statistics |
| `questDiscov add <text>` | Add a new question |
| `questDiscov answer <id>` | Mark question answered |
| `questDiscov prioritize` | Compute and show priorities |
| `questDiscov chat <query>` | Chat with the agent |

## Architecture

```
User (CLI/Obsidian)
        │
        ▼
┌─────────────────┐
│ LangGraph Agent │  ← ReAct loop with tools
└────────┬────────┘
         │
    ┌────┴────┐
    ▼         ▼
┌───────┐ ┌──────────┐
│ Graph │ │ Priority │
│ Tools │ │ Pipeline │
└───┬───┘ └────┬─────┘
    │          │
    ▼          ▼
┌─────────────────┐
│   FalkorDB     │
└─────────────────┘
```

## Development

```bash
# Install dev dependencies
pip install -e ".[dev]"

# Run tests
pytest tests/ -v

# Lint
ruff check src/
```

## Features (MVP)

- [x] Knowledge graph storage (FalkorDB)
- [x] Topological sorting for dependency order
- [x] Betweenness centrality for importance
- [x] Priority pipeline (entropy × centrality)
- [x] LangGraph ReAct agent
- [x] Obsidian integration
