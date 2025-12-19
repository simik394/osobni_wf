# Logic-Driven Infrastructure (LDI)

> Model-based configuration management for JetBrains YouTrack using logic programming.

## Overview

Replace imperative IaC scripts with **declarative logic inference** — instead of "if X doesn't exist, create X", define axioms and let the Prolog solver compute the delta.

## Architecture

```
┌─────────────────┐     ┌──────────────────────────────────────┐
│  Obsidian Vault │────▶│         Nomad Batch Job              │
│  (Rules in MD)  │     │  ┌──────────┐  ┌───────┐  ┌───────┐  │
└─────────────────┘     │  │Controller│─▶│ Prolog│─▶│Actuator│ │
                        │  │ (Python) │  │ Logic │  │(Python)│ │
┌─────────────────┐     │  └──────────┘  └───────┘  └───────┘  │
│  YouTrack API   │◀───▶│                                      │
│ (Current State) │     └──────────────────────────────────────┘
└─────────────────┘                    ▲
                                       │
                        ┌──────────────┴──────────────┐
                        │       n8n Orchestrator      │
                        │   (Triggers & Monitoring)   │
                        └─────────────────────────────┘
```

## Quick Start

```bash
# Build the Docker image
docker build -t ldi-logic-core docker/

# Run locally (dry-run)
docker run --rm \
  -e YOUTRACK_TOKEN=$YOUTRACK_TOKEN \
  -e YOUTRACK_URL=https://youtrack.example.com \
  -v $(pwd)/obsidian-rules:/rules:ro \
  ldi-logic-core --dry-run

# Deploy via Nomad
nomad job run nomad/logic-core.nomad.hcl
```

## Directory Structure

```
logic-driven-iac/
├── docker/Dockerfile        # Prolog + Python runtime
├── nomad/logic-core.nomad.hcl
├── src/
│   ├── controller/          # Python sensing layer
│   ├── logic/               # Prolog inference rules
│   └── actuator/            # Python API execution
├── obsidian-rules/          # Markdown rule definitions
└── docs/                    # Architecture docs
```

## Documentation

- [Architecture](docs/architecture.md)
- [API Reference](docs/api-reference.md)

## License

MIT
