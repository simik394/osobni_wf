# Development Process Guide

> How to propose, specify, and implement features in this project.

---

## 1. Feature Proposal

Before implementation, document the feature in a **specification file**.

### When to Create a Spec
- New cross-service functionality (e.g., registry, unified workflows)
- Major changes to existing behavior
- Features requiring architectural decisions

### Where
- Location: `docs/<feature_name>_spec.md`
- Example: `docs/artifact_registry_spec.md`

---

## 2. Specification Structure

### Required Sections

| Section | Purpose |
|---------|---------|
| **Overview** | 1-2 sentences: What does this feature do? |
| **Problem Statement** | What pain point does this solve? |
| **Goals** | Numbered list of success criteria |
| **Technical Design** | Data structures, ID formats, storage |
| **Operations** | Key functions/methods and their triggers |
| **CLI/API** | Commands and endpoints exposed |
| **Integration Points** | Where this hooks into existing code |
| **WBS** | Work Breakdown Structure with phases |

### Example Template

```markdown
# Feature Name Specification

> **Status**: Draft | In Progress | Complete  
> **Date**: YYYY-MM-DD

## 1. Overview
[One-liner]

## 2. Problem Statement
- Bullet 1
- Bullet 2

## 3. Goals
1. First outcome
2. Second outcome

## 4. Technical Design
### 4.1 Data Model
[Schema or JSON example]

### 4.2 Key Algorithms
[Pseudocode or description]

## 5. CLI Commands
\`\`\`bash
rsrch <command> [args]
\`\`\`

## 6. Integration Points
| Workflow | Hook |
|----------|------|
| existing-flow | where-to-call |

---

# Work Breakdown Structure

## Phase 1: [Name]
- [ ] Task
  - [ ] Subtask

## Phase 2: [Name]
...
```

---

## 3. What to Include

✅ **Do Include:**
- Concrete examples (sample JSON, command output)
- ID formats with character sets
- Error handling behavior
- "Nice-to-have" items marked as future work
- Integration points with existing code

❌ **Avoid:**
- Implementation details that belong in code comments
- Vague statements ("make it fast")
- Duplicating information already in `AGENTS.md`
- Over-specifying UI (selectors change; describe intent)

---

## 4. WBS Guidelines

### Structure
- **Phases** group related work (e.g., "Core Logic", "CLI", "Testing")
- **Tasks** are actionable items (`[ ]` or `[x]`)
- **Subtasks** break down complex tasks

### Granularity
- Each task should be completable in **1-3 tool calls**
- If a task needs 10+ calls, split it

### Checkboxes
- `[ ]` — Not started
- `[/]` — In progress (custom notation)
- `[x]` — Complete

### Example
```markdown
## Phase 1: Core Registry ✅

- [x] Create `src/artifact-registry.ts`
  - [x] Define types
  - [x] Implement `load()` / `save()`
  - [x] Implement `registerSession()`
```

---

## 5. Workflow

```
1. Identify Need
      ↓
2. Create Spec in docs/<name>_spec.md
      ↓
3. Review with user (if blocking decisions exist)
      ↓
4. Implement Phase by Phase
      ↓
5. Update WBS checkboxes as you go
      ↓
6. Commit after each phase
      ↓
7. Mark spec status as "Complete"
```

---

## 6. Commit Messages

Follow conventional commits:

```
feat: implement <feature> phase N

- bullet 1
- bullet 2
```

Prefix options:
- `feat:` — New functionality
- `fix:` — Bug fix
- `docs:` — Documentation only
- `refactor:` — Code restructure, no behavior change
- `test:` — Adding tests

---

## 7. Lessons Learned

After completing a feature, append a **Lessons Learned** section to the spec:

```markdown
## Lessons Learned

- Selector X was fragile; use aria-label instead
- Google Docs title element changed; added fallback
```

This helps future development avoid the same issues.
