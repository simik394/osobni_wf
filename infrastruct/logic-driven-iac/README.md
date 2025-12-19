# Logic-Driven Infrastructure (LDI)

> Model-based configuration management for JetBrains YouTrack using logic programming.

## How It Works

1. **You define** what your YouTrack should look like in `obsidian-rules/*.md`
2. **The tool reads** your actual YouTrack via API
3. **Prolog computes** what's missing/different
4. **Changes are applied** automatically

## Defining Your YouTrack Structure

Edit files in `obsidian-rules/` folder. Write Prolog facts in code blocks:

```markdown
# My Project Config

​```prolog
% I want a Priority dropdown in project DEMO
target_field('Priority', enum, 'DEMO').
field_uses_bundle('Priority', 'PriorityBundle').

% With these values
target_bundle_value('PriorityBundle', 'Critical').
target_bundle_value('PriorityBundle', 'High').
target_bundle_value('PriorityBundle', 'Medium').
target_bundle_value('PriorityBundle', 'Low').
​```
```

### Available Facts

| Fact | Meaning |
|------|---------|
| `target_field(Name, Type, Project)` | You want field `Name` of `Type` in `Project` |
| `field_uses_bundle(Field, Bundle)` | Field uses this bundle for values |
| `target_bundle_value(Bundle, Value)` | Bundle should have this value |

### Field Types

- `enum` - Dropdown list
- `state` - Workflow state  
- `string` - Text field
- `integer` - Number field

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
