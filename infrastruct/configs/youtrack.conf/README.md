# Logic-Driven Infrastructure (LDI)

> Model-based configuration management for JetBrains YouTrack using logic programming.

## How It Works

1. **You define** what your YouTrack should look like in `obsidian-rules/*.md`
2. **The tool reads** your actual YouTrack via API
3. **Prolog computes** what's missing/different
4. **Changes are applied** automatically

## Defining Your YouTrack Structure

Create YAML files in `obsidian-rules/` folder:

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
      - name: Done
        resolved: true

  - name: Priority
    type: enum
    bundle: PriorityBundle
    values: [Critical, High, Medium, Low]
```

### Field Types

| Type | Description |
|------|-------------|
| `enum` | Dropdown list |
| `state` | Workflow state (with resolved flag) |
| `string` | Text field |
| `integer` | Number field |
| `text` | Multi-line text |
| `period` | Time duration |

### Advanced: Prolog Facts

For complex logic, you can also write raw Prolog facts:

```prolog
target_field('Priority', 'enum', 'DEMO').
field_uses_bundle('Priority', 'PriorityBundle').
target_bundle_value('PriorityBundle', 'Critical').
```

---

## Quick Start

```bash
# Run tests
./dev.sh test

# Start interactive shell (Prolog + Python available)
./dev.sh

# Run with YouTrack (dry-run)
YOUTRACK_TOKEN=xxx ./dev.sh shell
# then inside: python3 -m src.controller.main --youtrack-url https://yt.example.com --dry-run
```

## Architecture

```
obsidian-rules/*.md  →  Controller  →  Prolog  →  Actuator  →  YouTrack API
     (YOUR RULES)       (reads API)    (diff)     (writes)
```

## Directory Structure

```
├── obsidian-rules/     ← YOUR CONFIG GOES HERE
├── src/
│   ├── controller/     # Python: reads YouTrack API
│   ├── logic/          # Prolog: computes diff
│   └── actuator/       # Python: applies changes
├── dev.sh              # Run dev environment
└── tests/              # Python + Prolog tests
```
