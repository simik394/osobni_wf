# Task Planner

Multi-objective task planning using OR-Tools CP-SAT solver.

## Features

- **Dependency-aware scheduling** - Respects task dependencies (A before B)
- **Parallel batch selection** - Avoids file conflicts for concurrent execution
- **Multi-objective optimization** - Balances speed, coverage, and urgency
- **Pareto frontier** - Shows tradeoff options, not just one "best"
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
```

### Python API

```python
from models import load_from_json
from solver import TaskPlannerSolver

data = {...}  # Your tasks and goals
request = load_from_json(data)
solver = TaskPlannerSolver(request)
result = solver.solve()

# result.recommended_path - Best plan by weighted objectives
# result.immediate_batch - Tasks to dispatch now
# result.pareto_paths - All non-dominated solutions
# result.explanation - Human-readable summary
```

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
| File conflicts | Graph Coloring | Avoid parallel conflicts |
| Scheduling | CP-SAT (OR-Tools) | Optimal task timing |
| Multi-objective | Pareto Frontier | Show tradeoff options |
