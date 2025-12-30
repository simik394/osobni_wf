# Feature Proposal: Windmill Integration

**Status:** Proposed  
**Priority:** High  
**Complexity:** ★★☆ Medium  

## Problem

The planner runs standalone. We need it integrated with Windmill for automated dispatch to solvers (angrav, Jules, etc.).

## Solution

Create Windmill flow that:
1. Pulls tasks from YouTrack
2. Runs planner to get optimal batch
3. Dispatches batch to solver_dispatch.ts

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Windmill                                 │
│                                                             │
│  ┌───────────────┐    ┌───────────────┐    ┌─────────────┐ │
│  │ YouTrack Pull │ → │ Python Planner │ → │ TS Dispatch │ │
│  │ (task_ingest) │    │  (solver.py)   │    │  (angrav)   │ │
│  └───────────────┘    └───────────────┘    └─────────────┘ │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Windmill Flow: `planner_dispatch`

```python
# windmill/flows/planner_dispatch.py

import subprocess
import json

def main(project: str = "SAM", max_parallel: int = 15):
    # 1. Fetch issues from YouTrack (via REST or subprocess)
    issues = fetch_youtrack_issues(project)
    
    # 2. Run planner
    result = subprocess.run(
        ["python3", "cli.py", "solve", "--input", "-", "--json"],
        input=json.dumps(issues),
        capture_output=True,
        cwd="/path/to/planner"
    )
    plan = json.loads(result.stdout)
    
    # 3. Dispatch immediate batch
    for task_id in plan['immediate_batch'][:max_parallel]:
        # Trigger solver_dispatch for each task
        wmill.run_script_async(
            "f/angrav/solver_dispatch",
            {"issue_id": task_id}
        )
    
    return {
        "dispatched": plan['immediate_batch'][:max_parallel],
        "deferred": plan['immediate_batch'][max_parallel:],
    }
```

## Scheduling

```yaml
# Windmill schedule
cron: "*/15 * * * *"  # Every 15 minutes
flow: f/planner/planner_dispatch
args:
  project: SAM
  max_parallel: 15
```

## Alternative: REST API

Expose planner as HTTP service:

```python
# api.py
from flask import Flask, request, jsonify

app = Flask(__name__)

@app.route("/plan", methods=["POST"])
def plan():
    data = request.json
    request = load_from_json(data)
    result = TaskPlannerSolver(request).solve()
    return jsonify({
        "batch": result.immediate_batch,
        "explanation": result.explanation
    })
```

## Dependencies

- Windmill Python runtime
- Network access to YouTrack
- Path to planner module
