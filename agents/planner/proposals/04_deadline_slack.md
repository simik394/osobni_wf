# Feature Proposal: Deadline Slack Analysis

**Status:** Proposed  
**Priority:** Medium  
**Complexity:** ★☆☆ Low  

## Problem

Users need to know how much buffer exists before deadlines become critical. "Can I afford to delay T1 by 2 days?"

## Solution

Add `slack` command to calculate deadline buffer for each task.

## CLI Interface

```bash
python cli.py slack --input tasks.json
python cli.py slack --input tasks.json --task T1  # Single task detail
```

## Key Concepts

- **Earliest Start (ES)**: When task can start (all deps done)
- **Latest Start (LS)**: When task must start to meet deadline
- **Slack**: LS - ES (how much delay is acceptable)
- **Critical Path**: Tasks with zero slack

## Output Format

```
## Deadline Slack Analysis

### Critical Path (slack = 0)
⚠️  T1 → T2 → T5 → Deadline(Jan 15)

### Tasks by Slack

| Task | Slack | ES | LS | Deadline |
|------|-------|----|----|----------|
| T1   | 0d    | Now | Now | - |
| T2   | 0d    | +8h | +8h | - |
| T3   | 3d    | +8h | +80h | - |
| T4   | 5d    | Now | +40h | Jan 20 |
| T5   | 0d    | +12h | +12h | Jan 15 |

### Recommendations
- T1, T2, T5 are critical - no delay allowed
- T3 can slip 3 days without affecting deadline
- T4 has most flexibility (5 days buffer)
```

## Implementation

```python
def calculate_slack(self) -> dict[str, dict]:
    # 1. Forward pass: calculate Earliest Start (ES) for each task
    # 2. Backward pass: calculate Latest Start (LS) from deadlines
    # 3. Slack = LS - ES
    # 4. Critical path = tasks with slack == 0
```

## Algorithm

Uses **Critical Path Method (CPM)**:
1. Topological sort tasks
2. Forward pass: ES[i] = max(ES[pred] + duration[pred])
3. Backward pass: LS[i] = min(LS[succ]) - duration[i]
4. Slack[i] = LS[i] - ES[i]

## Dependencies

- Requires `due_date` field in tasks or goals
