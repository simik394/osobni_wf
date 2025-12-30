# Feature Proposal: Goal Progress Tracker

**Status:** Proposed  
**Priority:** High  
**Complexity:** ★☆☆ Low  

## Problem

Users need a quick overview of how much progress has been made toward each goal and what remains.

## Solution

Add `progress` command that shows goal completion status.

## CLI Interface

```bash
python cli.py progress --input tasks.json
python cli.py progress --input tasks.json --goal G1  # Single goal detail
```

## Output Format

```
## Goal Progress

### G1: Authentication (Priority: 3)
████████░░ 80%  [4/5 tasks]
  ✓ T1: Setup auth module (8h)
  ✓ T2: Add login endpoint (4h)
  ○ T3: Add logout endpoint (2h) ← BLOCKED BY: none
  ✓ T4: Add password reset (4h)

### G2: Dashboard (Priority: 2)
████░░░░░░ 40%  [2/5 tasks]
  ✓ T10: Create layout (6h)
  ○ T11: Add charts (8h) ← BLOCKED BY: T10
  ○ T12: Add filters (4h) ← BLOCKED BY: T11
  ...

### G3: Documentation (Priority: 1)
░░░░░░░░░░ 0%  [0/2 tasks]
  ○ T20: Write API docs (4h)
  ○ T21: Write user guide (6h)

---
Overall: 43% complete (12/28 tasks)
Estimated remaining: 64h
```

## Implementation

```python
def cmd_progress(args):
    # 1. Load tasks and goals
    # 2. For each goal:
    #    - Count completed vs total tasks
    #    - Calculate percentage
    #    - List tasks with status
    #    - Show blockers for pending tasks
    # 3. Calculate overall progress
```

## Dependencies

- Requires `completed` field in Task model (or task state)

## Model Extension

```python
@dataclass
class Task:
    ...
    completed: bool = False  # New field
```
