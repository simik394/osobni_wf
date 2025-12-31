# Task Workflow: Ensuring Dependencies

## When Creating a New Task

Before creating a task in YouTrack, ask:

1. **What must be done BEFORE this task?**
   → Add "depends on" link to those issues

2. **What does this task ENABLE?**
   → Add "is required for" link to downstream issues

3. **Is this a subtask of a larger feature?**
   → Add "subtask of" link to parent Epic

## CLI Helper (Future)

```bash
# Create task with dependencies
python cli.py create-task \
  --project SAM \
  --summary "New feature" \
  --depends-on SAM-3,SAM-4 \
  --required-for SAM-10
```

## PM Agent Responsibility

The PM Agent should:
1. **Analyze new issues** - Suggest dependencies based on file overlap
2. **Validate before planning** - Warn about orphan tasks (no dependencies)
3. **Update after completion** - Check if downstream tasks are now unblocked

## YouTrack Link Types

| Link Type | Meaning |
|-----------|---------|
| `depends on` | This task needs X to be done first |
| `is required for` | X needs this task done first |
| `subtask of` | This is part of larger Epic |
| `blocks` / `is blocked by` | Explicit blocking relationship |

## Example Dependency Chain

```
SAM-3 (Gemini uploads)
    ↓ is required for
SAM-4 (Gemini Gems) ← needs upload support
    ↓ is required for  
SAM-10 (Research automation) ← needs Gems
```

## Validation Command (Future)

```bash
# Check for orphan tasks (no dependencies)
python cli.py validate --project SAM

# Output:
# ⚠️ SAM-6: No dependencies defined
# ✅ SAM-4: depends on SAM-3
```

---

## Step-Level Time Tracking

For tracking how long each step takes:

### Simple Subtasks → Checklist in Description

If a subtask has **no dependencies**, add it as a checkbox in the issue description:

```markdown
## Subtasks
- [ ] Research existing solutions
- [ ] Implement core logic
- [ ] Add tests
- [ ] Update documentation
```

**YouTrack automatically tracks when each checkbox is toggled.** Time per step can be inferred from the activity log.

### Subtasks with Dependencies → Separate Issues

If a subtask has dependencies (blocks other work), create a separate YouTrack issue:

```
SAM-10: Implement feature A
    ↓ is required for
SAM-11: Implement feature B (depends on A)
```

### Historical Logging

When completing work, log with step breakdown:

```bash
python cli.py log --task SAM-1 --actual 6h --solver jules \
  --notes "Research: 1h, Implementation: 4h, Tests: 1h"
```
