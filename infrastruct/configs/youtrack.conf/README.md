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

### Workflows

```yaml
workflows:
  - name: my-workflow
    title: "My Workflow"
    attached: true             # Attach to project
    rules:
      - name: on-change-rule
        type: on-change
        script_file: workflows/my-rule.js
      
      - name: action-rule
        type: action
        script: |
          // Inline JavaScript
          workflow.action({
            title: 'Do Something'
          });
    
    # Delete workflow
    state: absent
```

**Rule Types**: `on-change`, `on-schedule`, `state-machine`, `action`, `custom`

### Tags (Global)

```yaml
tags:
  - name: urgent
    untag_on_resolve: true     # Auto-remove when resolved
  
  - name: blocked
    untag_on_resolve: false
  
  - name: old-tag
    state: absent              # Delete tag
```

### Saved Queries (Global)

```yaml
saved_queries:
  - name: "My Open Issues"
    query: "project: DEMO for: me State: -Done"
  
  - name: "Critical Bugs"
    query: "project: DEMO Priority: Critical"
  
  - name: "Old Search"
    state: absent
```

---

## Full Feature Matrix

| Feature | Status | Notes |
|---------|--------|-------|
| **Projects** | ✅ | Create, update |
| **Custom Fields** | ✅ | All types, bundles |
| **Bundles (enum/state)** | ✅ | Create, add values |
| **Default Values** | ✅ | Per-project defaults |
| **Workflows** | ✅ | Create, attach/detach |
| **Workflow Rules** | ✅ | JS from file or inline |
| **Agile Boards** | ✅ | Full configuration |
| **Columns** | ✅ | Order, WIP limits |
| **Swimlanes** | ✅ | Field-based |
| **Color Coding** | ✅ | Field or project |
| **Estimation Fields** | ✅ | For burndown |
| **Backlog Query** | ✅ | Saved search |
| **Tags** | ✅ | Create, delete |
| **Saved Queries** | ✅ | Create, update, delete |
| Card Field Visibility | ❌ | UI-only, not API |
| Sprints | ⚠️ | Manual only |
| Reports | 📋 | [Proposal](docs/PROPOSAL_reports_iac.md) |
| User Groups | ❌ | Requires Hub API |

---

## Directory Structure

```
├── projects/           ← Your project configs
│   └── demo/
│       ├── project.yaml
│       └── workflows/
├── src/
│   ├── controller/     # API client
│   ├── logic/          # Prolog engine
│   ├── actuator/       # Change applier
│   └── config/         # YAML parser
├── tests/              # Test suite
└── docs/               # Documentation
```

---

## Advanced Usage

### Vault Integration

```bash
export VAULT_ADDR=http://vault:8200
export VAULT_TOKEN=xxx
# Token read from: secret/data/youtrack/api -> token
python3 -m src.controller.main --config-dir projects/demo
```

### Export Current State

```bash
python3 -m src.controller.main --export current-state.yaml
```

### Verbose Logging

```bash
python3 -m src.controller.main --config-dir projects/demo -v
```

---

## Development

```bash
# Run tests
./dev.sh test

# Interactive shell
./dev.sh

# Run Prolog directly
swipl src/logic/core.pl
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| 401 Unauthorized | Check token permissions |
| Field not updating | Verify field is attached to project |
| Bundle conflict | Bundles are global, ensure consistent values |
| Workflow error | Check JS syntax in script files |

---

## See Also

- [API Coverage](docs/api_coverage_comparison.md)
- [Reports Proposal](docs/PROPOSAL_reports_iac.md)
- [Windmill Integration](windmill/README.md)
