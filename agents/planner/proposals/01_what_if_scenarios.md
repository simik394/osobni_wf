# Feature Proposal: What-If Scenarios

**Status:** Proposed  
**Priority:** High  
**Complexity:** ★☆☆ Low  

## Problem

Users want to explore "what happens if I complete task X" without modifying the actual plan. This helps decision-making: "Should I focus on T1 or T4 today?"

## Solution

Add `what-if` command that simulates task completion and shows impact.

## CLI Interface

```bash
python cli.py what-if --complete T1 --input tasks.json
python cli.py what-if --complete T1,T2 --input tasks.json  # Multiple tasks
```

## Output Format

```
## What-If: Complete T1

### Immediate Impact
- T1: Setup auth module ✓ (simulated)

### Tasks Unblocked
- T2: Add login endpoint (4h) → NOW READY
- T3: Add logout endpoint (2h) → NOW READY

### Goal Progress
- G1 (Authentication): 0% → 33% (+33%)

### New Value-Blocking Leader
- T4: Create user dashboard (21.0 → 25.0 score)

### Recommendation
Complete T2 next (highest value among newly unblocked)
```

## Implementation

```python
def cmd_what_if(args):
    # 1. Load data
    # 2. Mark specified tasks as "complete"
    # 3. Recalculate:
    #    - Unblocked tasks
    #    - Goal progress
    #    - Value scores
    # 4. Compare before/after
    # 5. Generate recommendation
```

## Dependencies

- None (uses existing solver methods)

## Testing

```bash
python cli.py what-if --complete T1 --input /tmp/demo.json
# Should show T2, T3 become unblocked
```
