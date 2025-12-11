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
6. Write Tests (see below)
      ↓
7. Commit after each phase
      ↓
8. Mark spec status as "Complete"
```

---

## 6. Testing (Required)

**Rule: Always write test code BEFORE running tests.**

Tests are not manual—they are scripted and repeatable.

### Test File Location
- `tests/<feature_name>.test.ts` for unit/integration tests
- Delete test files after verification passes if they are one-time validations

### Test Structure
```typescript
// tests/artifact-registry.test.ts
import { ArtifactRegistry } from '../src/artifact-registry';

async function runTests() {
    const registry = new ArtifactRegistry('data/test');
    
    // Test 1: ID generation uniqueness
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
        ids.add(registry.generateBaseId());
    }
    console.assert(ids.size === 100, 'IDs should be unique');
    
    // Test 2: Session registration
    const sessionId = registry.registerSession('gem123', 'Test query');
    console.assert(sessionId.length === 3, 'Session ID should be 3 chars');
    
    // Test 3: Document registration
    const docId = registry.registerDocument(sessionId, 'doc456', 'Original Title');
    console.assert(docId.startsWith(sessionId), 'Doc ID should start with session ID');
    
    // Test 4: Lineage
    const lineage = registry.getLineage(docId);
    console.assert(lineage.length === 2, 'Lineage should have 2 entries');
    
    console.log('✅ All tests passed');
}

runTests().catch(console.error);
```

### Running Tests
```bash
npx ts-node tests/<feature>.test.ts
```

### WBS Test Entry
Always include a testing phase in the WBS:
```markdown
## Phase N: Testing
- [ ] Write tests in `tests/<feature>.test.ts`
- [ ] Run tests: `npx ts-node tests/<feature>.test.ts`
- [ ] Delete test file if one-time validation
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
