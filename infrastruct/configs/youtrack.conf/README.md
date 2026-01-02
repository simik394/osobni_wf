# YouTrack IaC - Infrastructure as Code

> Declarative configuration management for JetBrains YouTrack using Prolog-based logic programming.

## Overview

Define your YouTrack setup (projects, fields, bundles, workflows, agile boards, tags) as YAML. A Prolog inference engine computes the diff from your actual YouTrack, and an actuator applies changes automatically.

```
┌──────────────┐    ┌────────────┐    ┌──────────┐    ┌───────────┐
│  YAML Config │ →  │ Controller │ →  │  Prolog  │ →  │  Actuator │
│   (desired)  │    │  (sense)   │    │  (plan)  │    │  (apply)  │
└──────────────┘    └────────────┘    └──────────┘    └───────────┘
```

---

## Quick Start

```bash
# 1. Start dev container
./dev.sh

# 2. Set credentials (or use Vault)
export YOUTRACK_URL=https://youtrack.example.com
export YOUTRACK_TOKEN=perm:xxx

# 3. Dry run to see planned changes
python3 -m src.controller.main --config-dir projects/demo --dry-run

# 4. Apply changes
python3 -m src.controller.main --config-dir projects/demo
```

---

## YAML Schema Reference

### Project Configuration

```yaml
# projects/<name>/project.yaml
project:
  name: "My Project"
  shortName: DEMO      # Issue prefix (DEMO-1, DEMO-2)
  leader: admin        # Username
```

### Fields

```yaml
fields:
  # Enum field (dropdown)
  - name: Priority
    type: enum
    bundle: PriorityBundle
    default_value: Medium
    values: [Critical, High, Medium, Low]

  # State field (workflow states)
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

  # Other types
  - name: Estimation
    type: period

  - name: Story Points
    type: integer

  # Delete a field
  - name: OldField
    state: absent
```

**Supported Types**: `enum`, `state`, `string`, `integer`, `text`, `period`, `date`, `float`

### Agile Boards

```yaml
boards:
  - name: "Sprint Board"
    column_field: State        # Field for columns
    
    # Sprint settings
    sprints:
      enabled: false           # false = Kanban, true = Scrum
    
    # Visibility
    visible_to:
      - "All Users"
    
    # Columns with optional WIP limits
    columns:
      - "To do"
      - name: "In Progress"
        max_wip: 3             # Work-in-progress limit
      - "Done"
    
    # Swimlanes
    swimlane_field: Subsystem
    
    # Color coding
    color_coding:
      mode: field              # 'field' or 'project'
      field: Priority
    
    # Estimation fields (for charts)
    estimation_field: Story Points
    original_estimation_field: Estimation
    
    # Orphan issues
    orphans_at_top: true
    hide_orphans_swimlane: false
    
    # Backlog query
    backlog_query: "project: DEMO State: Open #Unresolved"
    
    # Multi-project board
    projects:
      - DEMO
      - CORE
```

> [!NOTE]
> **Card Field Visibility**: Configuration of which fields appear on board cards is currently UI-only and not supported by the YouTrack REST API.

### Workflows

Workflows can be defined globally or per-project. Rules can reference external `.js` files or contain inline scripts.

```yaml
workflows:
  - name: my-workflow
    title: "My Workflow"
    attached: true             # Attach to project
    rules:
      - name: on-change-rule
        type: on-change
        script_file: workflows/my-rule.js  # Relative to the yaml file
      
      - name: action-rule
        type: action
        script: |
          // Inline JavaScript (recommended for simple one-liners)
          workflow.action({
            title: 'Do Something'
          });
```

**Implementation Rules**:
- **`script_file`**: Must be placed in a `workflows/` directory relative to your configuration YAML.
- **Rule Types**: `on-change`, `on-schedule`, `state-machine`, `action`, `custom`.
- **Recommendation**: Use `script_file` for complex logic to enable syntax highlighting and easier debugging.

### Tags (Global)

```yaml
tags:
  - name: urgent
    untag_on_resolve: true     # Auto-remove when resolved
  
  - name: blocked
    untag_on_resolve: false
```

### Saved Queries (Global)

```yaml
saved_queries:
  - name: "My Open Issues"
    query: "project: DEMO for: me State: -Done"
```

---

## CLI Reference

The main entry point is `src.controller.main`.

```bash
python3 -m src.controller.main [OPTIONS]
```

| Option | Description |
|--------|-------------|
| `--youtrack-url` | Base URL of your YouTrack instance (e.g. `http://youtrack.internal`) |
| `--config-dir` | Directory containing your YAML configurations (default: `projects/demo`) |
| `--dry-run` | Only show planned actions without applying them |
| `--import-vault` | Fetch YouTrack token from HashiCorp Vault |
| `--export FILE` | Export current YouTrack state to a YAML file |
| `-v, --verbose` | Enable debug logging |

---

## Feature Matrix

| Feature | Status | Notes |
|---------|--------|-------|
| **Projects** | ✅ | Create, update |
| **Custom Fields** | ✅ | All types, bundles |
| **Agile Boards** | ✅ | Columns, WIP, Swimlanes, Color Coding |
| **Workflows** | ✅ | Attach, Detach, Rules (file/inline) |
| **Tags** | ✅ | Global management with `untag_on_resolve` |
| **Saved Queries** | ✅ | Creation and management |
| Card Visibility | ❌ | API Limitation |
| Reports | 📋 | [Proposal](docs/PROPOSAL_reports_iac.md) |

---

## Vault Configuration

When using `--import-vault`, the tool expects the following environment variables:

- `VAULT_ADDR`: Your Vault endpoint.
- `VAULT_TOKEN`: Your Vault authentication token.

**Secret Path**:
The tool looks for the secret at: `secret/data/youtrack/api`
**Expected Key**:
The secret must contain a key named `token` containing your YouTrack permanent token.

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| **401 Unauthorized** | Verify your token has *Low-level administration* permissions. |
| **`FileNotFoundError`** | Ensure workflow `.js` files are in the `workflows/` subfolder. |
| **Bundle Conflict** | Use unique names for bundles if they differ across projects. |

---

## See Also

- [API Coverage](docs/api_coverage_comparison.md)
- [Reports Proposal](docs/PROPOSAL_reports_iac.md)
- [Windmill Integration](windmill/README.md)
