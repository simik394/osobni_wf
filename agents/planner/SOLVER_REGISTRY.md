# Solver Registry

Centralized reference for AI solvers available in the PM orchestration system.

## Solvers

| Solver | Type | Concurrency | Best For |
|--------|------|-------------|----------|
| **angrav** | Browser automation | 1-3 tabs | Google AI Studio, Perplexity, research |
| **jules** | GitHub PR agent | 15 sessions | Code implementation, refactoring |
| **gemini** | API | Rate limited | Analysis, planning, documentation |
| **perplexity** | Research | 1 session | Web research, fact-checking |
| **local-slm** | Local LLM | Unlimited | Quick tasks, privacy-sensitive |

---

## Solver Capabilities

### angrav (Antigravity)
- **Location**: `/agents/angrav/`
- **Interface**: CDP browser automation
- **Capabilities**:
  - Google AI Studio (Gemini models)
  - Perplexity research
  - NotebookLM integration
  - Rate limit detection & tracking
- **Tags**: `#angrav`, `#research`, `#gemini-ui`

### jules
- **Location**: `/agents/angrav/src/solvers/jules.ts`
- **Interface**: REST API
- **Capabilities**:
  - GitHub PR creation
  - Code implementation
  - Refactoring
  - Bug fixes
- **Concurrency**: 15 concurrent sessions
- **Tags**: `#jules`, `#implement`, `#refactor`
- **Requires**: GitHub repo connected via Jules web app

### gemini (API)
- **Interface**: Google AI API
- **Capabilities**:
  - Text analysis
  - Code review
  - Documentation generation
  - Planning assistance
- **Tags**: `#gemini`, `#analyze`, `#docs`

### perplexity
- **Location**: `/agents/rsrch/` (via angrav)
- **Capabilities**:
  - Web research
  - Source citation
  - Fact verification
- **Tags**: `#research`, `#perplexity`

### local-slm
- **Interface**: Ollama / local endpoint
- **Capabilities**:
  - Quick text processing
  - Privacy-sensitive tasks
  - Offline operation
- **Tags**: `#local`, `#quick`

---

## Task → Solver Matching Rules

```python
def suggest_solver(task) -> str:
    """Heuristic solver matching based on task properties"""
    
    summary = task.summary.lower()
    
    # Implementation tasks → Jules
    if any(kw in summary for kw in ['implement', 'create', 'add', 'build', 'refactor']):
        return 'jules'
    
    # Research tasks → Perplexity/Angrav
    if any(kw in summary for kw in ['research', 'investigate', 'explore', 'compare']):
        return 'perplexity'
    
    # Documentation → Gemini API
    if any(kw in summary for kw in ['document', 'describe', 'explain', 'readme']):
        return 'gemini'
    
    # Analysis → Gemini API
    if any(kw in summary for kw in ['analyze', 'review', 'audit', 'assess']):
        return 'gemini'
    
    # Default
    return 'angrav'
```

---

## YouTrack Integration

### Tags for Solver Hints
Issues can be tagged to hint at preferred solver:
- `#auto` - Let PM agent decide
- `#jules` - Prefer Jules for implementation
- `#angrav` - Prefer Antigravity/browser
- `#research` - Prefer Perplexity
- `#gemini` - Prefer Gemini API

### State Mapping
| YouTrack State | Planner Status |
|----------------|----------------|
| Submitted | Ready for automation |
| Open | Ready for automation |
| In Progress | Currently processing |
| Fixed | Completed |
| Verified | Completed + tested |

### Priority Mapping
| YouTrack Priority | Planner Score Weight |
|-------------------|---------------------|
| Show-stopper | 5 (highest) |
| Critical | 4 |
| Major | 3 |
| Normal | 2 |
| Minor | 1 |

---

## Rate Limit Tracking

Rate limits are stored in Redis with keys:
```
ratelimit:{solver}:{model} → {availableAt, rawMessage}
```

Check availability before dispatch:
```typescript
const available = await checkSolverAvailability('jules');
if (!available) {
    // Fallback to alternative solver
}
```

---

## PM Agent Responsibilities

The PM Agent uses this registry to:

1. **Match tasks to solvers** - Based on keywords, file types, tags
2. **Set YouTrack tags** - Add solver hint tags to issues
3. **Update estimates** - Use historical data per solver
4. **Track availability** - Check rate limits before assignment
5. **Report results** - Update issue state after completion

---

## File Locations

| Component | Path |
|-----------|------|
| Planner | `/agents/planner/` |
| Angrav | `/agents/angrav/` |
| Jules adapter | `/agents/angrav/src/solvers/jules.ts` |
| Windmill flows | `/agents/angrav/windmill/` |
| Rate limit storage | `/agents/angrav/src/ratelimit-storage.ts` |
| PM workflows | `/agents/proj/docs/workflows.md` |
