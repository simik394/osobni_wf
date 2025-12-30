# Feature Proposal: YouTrack Integration

**Status:** Proposed  
**Priority:** High  
**Complexity:** ★★☆ Medium  

## Problem

Currently, tasks must be manually exported to JSON. Real tasks live in YouTrack, requiring manual sync.

## Solution

Add `sync` command to pull tasks from YouTrack and optionally push recommendations back.

## CLI Interface

```bash
# Pull tasks from YouTrack
python cli.py sync --project SAM --pull

# Pull and run planner
python cli.py sync --project SAM --plan

# Push recommendations to YouTrack (update priority/tags)
python cli.py sync --project SAM --push
```

## YouTrack Mapping

| YouTrack Field | Planner Field |
|----------------|---------------|
| `id` (e.g., SAM-123) | `task.id` |
| `summary` | `task.summary` |
| `Priority` | `task.priority` |
| `Estimation` | `task.estimate_hours` |
| `depends on` links | `task.depends_on` |
| `subtask of` parent | `task.goal_id` |
| `State` | `task.completed` |
| Tags (`#auto`, `#jules`) | `task.solver_hint` |

## Output Format

```
## YouTrack Sync: SAM

### Pulled Tasks
- SAM-101: Setup authentication (MAJOR, 8h)
- SAM-102: Add login endpoint (NORMAL, 4h, depends: SAM-101)
- SAM-103: Create dashboard (MAJOR, 16h)
...
Total: 15 tasks, 3 goals

### Planner Results
- Recommended batch: SAM-101, SAM-103 (no conflicts)
- Top value blocker: SAM-101 (unlocks 2 tasks)

### Push to YouTrack? [y/N]
```

## Implementation

```python
from youtrack_mcp import search_issues, update_issue

def cmd_sync(args):
    # 1. Search YouTrack for project issues
    query = f"project: {args.project} State: Open, Submitted"
    issues = search_issues(query)
    
    # 2. Map to planner format
    tasks = [map_youtrack_to_task(i) for i in issues]
    goals = infer_goals_from_subtasks(tasks)
    
    # 3. Run planner
    request = PlanRequest(tasks=tasks, goals=goals)
    result = solve(request)
    
    # 4. Optionally push back
    if args.push:
        for task_id in result.immediate_batch:
            update_issue(task_id, tags=['next', 'planner-recommended'])
```

## Dependencies

- YouTrack MCP (`mcp_napovedayt`) or REST API
- API token for authentication

## Configuration

```bash
export YOUTRACK_BASE_URL=https://youtrack.example.com
export YOUTRACK_TOKEN=perm:xxx
```
