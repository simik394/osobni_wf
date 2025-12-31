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
