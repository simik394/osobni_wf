# Task Planner

Multi-objective task planning using OR-Tools CP-SAT solver.

## Features

- **Dependency-aware scheduling** - Respects task dependencies (A before B)
- **Parallel batch selection** - Avoids file conflicts for concurrent execution
- **Multi-objective optimization** - Balances speed, coverage, and urgency
- **Pareto frontier** - Shows tradeoff options, not just one "best"
- **Value-blocking analysis** - Identifies tasks that unlock the most downstream value
- **Explainable** - Human-readable reasoning for recommendations

## Installation

```bash
pip install -r requirements.txt
```

## Usage

### CLI

```bash
# Run with demo data
python cli.py demo

# Solve with input file
python cli.py solve --input tasks.json

# Prioritize speed
python cli.py solve --input tasks.json --objective speed

# Get immediate batch for dispatch
python cli.py batch --input tasks.json --max-parallel 15

# Show tasks ranked by value impact (which block most work)
python cli.py value --input tasks.json
```

### Python API

```python
from models import load_from_json
from solver import TaskPlannerSolver

data = {...}  # Your tasks and goals
request = load_from_json(data)
solver = TaskPlannerSolver(request)

# Full planning
result = solver.solve()
# result.recommended_path - Best plan by weighted objectives
# result.immediate_batch - Tasks to dispatch now
# result.pareto_paths - All non-dominated solutions
# result.explanation - Human-readable summary

# Value-blocking analysis
top_tasks = solver.get_highest_value_tasks(limit=10)
# Returns tasks ranked by how much downstream value they unlock
```

## Value-Blocking Analysis

Identifies which tasks "block the most value" - i.e., which tasks, when completed, unlock the most downstream work.

### Value Score Formula

```
Value Score (0-100) =
    40% × (transitive tasks blocked / total tasks) +
    40% × (blocked hours / total hours) +
    20% × (blocked goals / total goals)
```

### Example Output

```
## Value-Blocking Analysis

### 1. T1: Setup auth
   - Value Score: **25.7/100**
   - Blocks 2 tasks (6h of work)
   - Required for goals: G1

### 2. T4: Dashboard
   - Value Score: **21.0/100**
   - Blocks 1 tasks (8h of work)
   - Required for goals: G2
```

**Higher score = complete this task first to unlock more value.**

## Input Format

```json
{
  "tasks": [
    {
      "id": "T1",
      "summary": "Implement feature X",
      "goal_id": "G1",
      "priority": "MAJOR",
      "estimate_hours": 8,
      "depends_on": [],
      "affected_files": ["src/feature.py"],
      "solver_hint": "jules"
    }
  ],
  "goals": [
    {
      "id": "G1",
      "name": "Release v2.0",
      "priority": 3,
      "tasks": ["T1", "T2"]
    }
  ],
  "available_hours": 40,
  "max_parallel": 15,
  "objective_weights": {
    "speed": 1.0,
    "coverage": 1.0,
    "urgency": 1.0
  }
}
```

## Algorithms Used

| Component | Algorithm | Purpose |
|-----------|-----------|---------|
| Dependency ordering | Topological Sort | Respect task dependencies |
| File conflicts | Set intersection | Avoid parallel conflicts |
| Scheduling | CP-SAT (OR-Tools) | Optimal task timing |
| Multi-objective | Pareto Frontier | Show tradeoff options |
| Value impact | Transitive DFS | Find downstream blockers |
