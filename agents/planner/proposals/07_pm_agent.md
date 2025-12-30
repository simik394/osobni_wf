# Feature Proposal: PM Agent

**Status:** Proposed  
**Priority:** High  
**Complexity:** ★★★ High  

## Problem

The planner can score and prioritize tasks, but there's no agent to:
1. Match tasks to appropriate solvers based on capabilities
2. Update YouTrack issues with solver hints and priorities
3. Track solver results and update historical data
4. Manage the full lifecycle from planning to completion

## Solution

Create a PM (Project Management) Agent that bridges the planner, YouTrack, and solvers.

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                        PM Agent                               │
│                                                              │
│  ┌────────────┐  ┌─────────────┐  ┌──────────────────────┐  │
│  │   Planner  │  │   Solver    │  │   Historical Data    │  │
│  │   Output   │→ │   Matcher   │→ │   (Estimation Cal)   │  │
│  └────────────┘  └─────────────┘  └──────────────────────┘  │
│         ↓               ↓                    ↓               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              YouTrack Updater                         │   │
│  │  - Set tags (#jules, #angrav, etc.)                  │   │
│  │  - Update Priority field                             │   │
│  │  - Set Estimation field                              │   │
│  │  - Update State (Ready/Blocked)                      │   │
│  └──────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
              ↓                              ↑
    ┌─────────────────┐             ┌─────────────────┐
    │    YouTrack     │             │ Solver Results  │
    │    (MCP API)    │             │ (Windmill)      │
    └─────────────────┘             └─────────────────┘
```

## Core Functions

### 1. Solver Matching
```python
def match_solver(task: Task) -> str:
    """
    Determine best solver for a task based on:
    - Task summary keywords
    - Affected file types
    - Historical performance
    - Current solver availability
    """
```

**Reference**: Uses `SOLVER_REGISTRY.md` for capabilities.

### 2. YouTrack Updates
```python
def update_issue(issue_id: str, updates: dict):
    """
    Update YouTrack issue via MCP:
    - tags: ['#jules', '#auto']
    - priority: 'Major'
    - estimation: '4h'
    - state: 'Open' or 'Blocked'
    """
```

### 3. Estimation Calibration
```python
def calibrate_estimate(task: Task) -> int:
    """
    Adjust estimate based on:
    - Historical actual vs estimated for similar tasks
    - Solver-specific multipliers
    - Task complexity signals
    """
```

### 4. Result Processing
```python
def process_solver_result(task_id: str, result: SolverResult):
    """
    After solver completes:
    - Update YouTrack state to Fixed
    - Log actual duration
    - Update historical data
    - Trigger dependent task check
    """
```

## Data Sources

| Source | What PM Agent Reads |
|--------|---------------------|
| Planner | Value scores, recommended batch |
| SOLVER_REGISTRY.md | Solver capabilities, matching rules |
| Redis | Rate limits, solver availability |
| Historical DB | Past estimates vs actuals |
| YouTrack (MCP) | Current issue states, dependencies |

## YouTrack Updates Made

| Field | When Updated | Source |
|-------|--------------|--------|
| Tags | After solver matching | PM Agent |
| Priority | After planner scoring | Value score → Priority mapping |
| Estimation | After calibration | Historical data |
| State | After dependency check | Planner dependency graph |
| Assignee | After dispatch | (Could set to bot user) |

## CLI Interface

```bash
# Process issues and update YouTrack
python pm_agent.py process --project SS

# Match solvers for issues (dry run)
python pm_agent.py match --project SS --dry-run

# Calibrate estimates from history
python pm_agent.py calibrate --project SS

# Process solver result
python pm_agent.py complete --issue SS-123 --duration 6h
```

## Implementation Phases

### Phase 1: Solver Matcher
- Read planner output
- Match tasks to solvers using SOLVER_REGISTRY
- Output recommendations

### Phase 2: YouTrack Writer
- Update issue tags via MCP
- Update priority based on value score
- Mark blocked/ready based on dependencies

### Phase 3: Historical Tracking
- Log completions with actual duration
- Build calibration dataset
- Adjust future estimates

### Phase 4: Full Automation
- Windmill flow: Planner → PM Agent → Dispatch
- Automatic result processing
- Feedback loop for continuous improvement

## File Structure

```
agents/planner/
├── pm_agent.py          # Main agent logic
├── solver_matcher.py    # Task → Solver matching
├── youtrack_writer.py   # YouTrack update functions
├── history_tracker.py   # Historical data management
├── SOLVER_REGISTRY.md   # Centralized solver info
└── history/
    └── completions.jsonl  # Append-only completion log
```

## Dependencies

- `mcp_napovedayt` for YouTrack API
- `planner/solver.py` for planning
- Redis for rate limit checks
- JSON/SQLite for historical data

## Success Metrics

1. **Solver match accuracy** - % of tasks completed by suggested solver
2. **Estimation accuracy** - Reduction in |actual - estimated| over time
3. **Automation rate** - % of issues processed without manual intervention
