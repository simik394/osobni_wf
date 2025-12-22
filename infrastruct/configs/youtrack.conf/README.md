# Logic-Driven Infrastructure (LDI)

> Model-based configuration management for JetBrains YouTrack using logic programming.

## Overview

This project lets you define your YouTrack setup (projects, fields, bundles) as YAML configuration files. A Prolog inference engine computes what's different from your actual YouTrack, and an actuator applies the changes automatically.

---

## Prerequisites

- **Docker** - For development environment
- **YouTrack Instance** - Self-hosted or Cloud
- **YouTrack API Token** - Generate from YouTrack profile settings

---

## Quick Start

### 1. Start Development Environment

```bash
# Interactive shell with Python + Prolog
./dev.sh

# Or run tests first
./dev.sh test
```

### 2. Configure YouTrack Connection

```bash
export YOUTRACK_URL=https://youtrack.example.com
export YOUTRACK_TOKEN=perm:xxx...
```

### 3. Run Sync (Dry-Run)

```bash
python3 -m src.controller.main --dry-run
```

---

## How It Works

1. **You define** your desired state in `obsidian-rules/*.yaml`
2. **Controller** reads your actual YouTrack via REST API
3. **Prolog** computes the diff (missing fields, wrong values)
4. **Actuator** applies changes to YouTrack

```
┌────────────────┐    ┌─────────────┐    ┌──────────┐    ┌─────────────┐
│ obsidian-rules │ → │ Controller  │ → │  Prolog  │ → │  Actuator   │
│   (YAML/MD)    │    │ (read API)  │    │  (diff)  │    │ (write API) │
└────────────────┘    └─────────────┘    └──────────┘    └─────────────┘
```

---

## Defining Your Configuration

Create YAML files in `obsidian-rules/`:

```yaml
# obsidian-rules/my-project.yaml
project:
  name: My Project
  shortName: DEMO
  leader: admin

fields:
  - name: State
    type: state
    bundle: StateBundle
    values:
      - name: Open
        resolved: false
      - name: In Progress
        resolved: false
      - name: Done
        resolved: true

  - name: Priority
    type: enum
    bundle: PriorityBundle
    values: [Critical, High, Medium, Low]
```

### Supported Field Types

| Type | Description | Example |
|------|-------------|---------|
| `enum` | Dropdown list | Priority, Category |
| `state` | Workflow state | Open, Done (with resolved flag) |
| `string` | Text field | Description |
| `integer` | Number | Story Points |
| `text` | Multi-line text | Notes |
| `period` | Time duration | Estimate |

### State Bundles (Workflow States)

State bundles define issue lifecycle states:

```yaml
fields:
  - name: State
    type: state
    bundle: MyStateBundle
    values:
      - name: Open
        resolved: false
      - name: In Progress
        resolved: false
      - name: Done
        resolved: true   # Marks issues as resolved
```

---

## Directory Structure

```
├── obsidian-rules/     ← YOUR CONFIG GOES HERE
│   └── *.yaml          # Project/field definitions
├── src/
│   ├── controller/     # Python: reads YouTrack API
│   ├── logic/          # Prolog: computes diff
│   ├── actuator/       # Python: applies changes
│   └── config/         # YAML/Prolog config parsers
├── docs/
│   └── api_coverage_comparison.md
├── dev.sh              # Development environment
├── tests/              # Python + Prolog tests
└── windmill/           # Windmill integration (CI/CD)
```

---

## Development

### Running Tests

```bash
./dev.sh test
```

### Interactive Shell

```bash
./dev.sh

# Inside container:
python3 -m src.controller.main --help
swipl src/logic/core.pl
```

### With Live YouTrack

```bash
YOUTRACK_URL=https://yt.example.com YOUTRACK_TOKEN=xxx ./dev.sh shell

# Then inside:
python3 -m src.controller.main --dry-run
```

---

## API Coverage

See [docs/api_coverage_comparison.md](file:///home/sim/Obsi/Prods/01-pwf/infrastruct/configs/youtrack.conf/docs/api_coverage_comparison.md) for:
- What YouTrack API endpoints are supported
- What's implemented vs planned
- Roadmap for additional features

**Current coverage**: ~50-75% for fields, bundles, projects

---

## Windmill Integration

For automated deployments via Windmill, see [windmill/README.md](file:///home/sim/Obsi/Prods/01-pwf/infrastruct/configs/youtrack.conf/windmill/README.md).

---

## Troubleshooting

### "Token not found" or 401 errors

Ensure your token has admin permissions and is correctly set:
```bash
echo $YOUTRACK_TOKEN
```

### Prolog syntax errors

Validate your YAML first:
```bash
python3 -c "import yaml; yaml.safe_load(open('obsidian-rules/my-project.yaml'))"
```

### Docker container won't start

Check Docker is running:
```bash
docker info
```
