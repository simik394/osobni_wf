# Feature Proposal: Historical Learning

**Status:** Proposed  
**Priority:** Low  
**Complexity:** ★★★ High  

## Problem

Estimates are often wrong. Without tracking actual vs estimated time, we can't improve future predictions.

## Solution

Track task execution history and use it to calibrate future estimates.

## Data Model

```python
@dataclass
class TaskExecution:
    task_id: str
    estimated_hours: float
    actual_hours: float
    started_at: datetime
    completed_at: datetime
    solver_used: str
    success: bool
    notes: Optional[str]

@dataclass
class CalibrationStats:
    task_type: str          # e.g., "bugfix", "feature", "refactor"
    avg_ratio: float        # actual / estimated
    sample_size: int
    confidence: float       # higher with more samples
```

## CLI Interface

```bash
# Log a completion
python cli.py log --task T1 --actual 12 --estimated 8

# View calibration stats
python cli.py calibrate --input history.json

# Apply calibration to estimates
python cli.py solve --input tasks.json --calibrate
```

## Output Format

```
## Estimation Calibration

### By Task Type
| Type | Avg Ratio | Samples | Adjustment |
|------|-----------|---------|------------|
| bugfix | 0.8x | 15 | -20% (faster than expected) |
| feature | 1.5x | 23 | +50% (usually underestimated) |
| refactor | 1.2x | 8 | +20% |
| docs | 1.0x | 12 | No adjustment |

### By Solver
| Solver | Avg Ratio | Notes |
|--------|-----------|-------|
| jules | 0.7x | Faster on implementation |
| angrav | 1.1x | Slightly slower |

### Recommendations
- Feature estimates should be multiplied by 1.5
- Consider using Jules for implementation tasks
```

## Storage

Options:
1. **JSON file**: Simple, local
2. **SQLite**: Query-friendly
3. **FalkorDB**: Graph relationships

```
history/
  executions.jsonl  # Append-only log
  calibration.json  # Aggregated stats
```

## Implementation

```python
def calibrate_estimate(task: Task, history: list[TaskExecution]) -> float:
    # 1. Find similar past tasks (same type, similar size)
    similar = find_similar_tasks(task, history)
    
    # 2. Calculate average ratio
    if len(similar) >= 3:
        ratios = [e.actual_hours / e.estimated_hours for e in similar]
        avg_ratio = sum(ratios) / len(ratios)
        return task.estimate_hours * avg_ratio
    
    # 3. Not enough data - return original
    return task.estimate_hours
```

## Dependencies

- Requires runtime tracking (integration with solver results)
- Storage for historical data
- Enough data points for meaningful calibration (10+ per category)
