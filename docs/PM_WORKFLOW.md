# Jules PM Workflow Manual

This manual documents best practices for Project Manager (PM) orchestration with Jules agents.

## Available Interfaces

| Interface | Create Session | Send Message | Approve Plan | Publish PR |
|-----------|---------------|--------------|--------------|------------|
| Official `jules` CLI | ✅ | ❌ | ❌ | ❌ |
| Jules REST API | ✅ | ✅ | ✅ | ❌ |
| jules-mcp (Gemini) | ✅ | ✅ | ✅ | ❌ |
| jules-go | ✅ | ❌ | ❌ | ✅ (browser) |

---

## Decision: New Session vs Send Message

### Use NEW SESSION when:
- Starting fresh work on a new issue
- Assigning unrelated tasks
- Work requires different branch/context
- Previous session is COMPLETED or FAILED
- You want clean separation of concerns

```bash
jules new "Implement TOOLS-123: Feature X"
# or via MCP:
mcp_jules-mcp_create_session(source, prompt)
```

### Use SEND MESSAGE when:
- Providing follow-up instructions to running session
- Answering questions from Jules (AWAITING_USER_FEEDBACK)
- Clarifying requirements mid-task
- Correcting misunderstandings
- Providing additional context

```python
# Only via MCP or REST API:
mcp_jules-mcp_send_session_message(session_id, prompt)
```

### Decision Flowchart

```
Is there an existing session for this work?
  │
  ├─ NO → Create NEW SESSION
  │
  └─ YES → What is the session state?
              │
              ├─ COMPLETED/FAILED → Create NEW SESSION
              │
              ├─ AWAITING_USER_FEEDBACK → SEND MESSAGE
              │
              ├─ AWAITING_PLAN_APPROVAL → APPROVE PLAN or SEND MESSAGE
              │
              └─ IN_PROGRESS → Wait, then SEND MESSAGE if needed
```

---

## Session States

| State | Meaning | PM Action |
|-------|---------|-----------|
| `IN_PROGRESS` | Jules is working | Wait |
| `AWAITING_PLAN_APPROVAL` | Jules needs plan approval | Approve or reject |
| `AWAITING_USER_FEEDBACK` | Jules needs clarification | Send message |
| `COMPLETED` | Work done, ready for review | Publish PR, merge |
| `FAILED` | Something went wrong | Investigate, create new session |

---

## PM Workflow Steps

### 1. Morning Review
```bash
# Check session status
jules remote list --session | grep -E "Awaiting|Failed"

# Or via MCP:
mcp_jules-mcp_list_sessions(page_size=50)
```

### 2. Handle Awaiting Feedback
For each session in AWAITING_USER_FEEDBACK:
1. Check what Jules is asking
2. Send clarifying message
3. Monitor for completion

```python
mcp_jules-mcp_get_session(session_id)
mcp_jules-mcp_send_session_message(session_id, "The answer is...")
```

### 3. Handle Completed Sessions
1. Review the work
2. Publish PR (if not auto-published)
3. Merge PR (if CI passes)
4. Update YouTrack issue

### 4. Handle Failed Sessions
1. Check failure reason
2. Either:
   - Create new session with better prompt
   - Send message to retry (if session allows)

### 5. Delegate New Work
1. Review YouTrack backlog
2. Create delegation prompt with:
   - Clear requirements
   - Acceptance criteria
   - File locations
   - Link to YouTrack issue
3. Create session

---

## Batch Delegation Best Practices

### Bundle Related Issues
Group 2-4 related issues into one session:
```markdown
# Bundle: Feature X Implementation

## 1. TOOLS-123: Core Feature
See: https://napoveda.youtrack.cloud/issue/TOOLS-123
...

## 2. TOOLS-124: Tests for Feature
See: https://napoveda.youtrack.cloud/issue/TOOLS-124
...
```

### Include in Every Delegation
- [ ] YouTrack issue link
- [ ] Specific file paths
- [ ] Acceptance criteria
- [ ] Verification steps
- [ ] Non-breaking constraints

### Don't Include
- Vague requirements
- Multiple unrelated issues
- Conflicting instructions

---

## Publishing PRs

### When to Publish
- Session state is COMPLETED
- Session has `outputs.pull_request = null` (not yet published)

### How to Publish
**Option A: jules-go (recommended)**
```bash
jules-cli publish <session_id>
# Or bulk:
jules-cli publish-all
```

**Option B: Manual in UI**
1. Go to https://jules.google.com/session/<id>
2. Click "Publish branch" dropdown
3. Select "Publish PR"

---

## Merging PRs

### Pre-merge Checklist
- [ ] CI passes
- [ ] No merge conflicts
- [ ] Code review passed
- [ ] Tests included

### Merge Command
```bash
gh pr merge <number> --squash
```

### Post-merge Steps
1. Update YouTrack issue to "Fixed"
2. Add PR link as comment
3. Close related sessions

---

## YouTrack Integration

### Sync Completed Work
For each completed session with merged PR:
```python
# Find linked issues from prompt
issues = extract_issue_ids(session.prompt)  # e.g., TOOLS-123

# Update each
for issue in issues:
    youtrack.update_state(issue, "Fixed")
    youtrack.add_comment(issue, f"Merged via {pr_url}")
```

### Planned Automation (TOOLS-141)
```bash
jules-cli sync-youtrack --dry-run
jules-cli sync-youtrack
```

---

## Troubleshooting

### Session Stuck in Progress
- Wait (can take 30+ minutes for complex tasks)
- Check Jules UI for activity
- If no activity for 1+ hour, may be stuck

### Failed to Create Session
- Check `jules login` status
- Verify repo exists and is connected
- Check API rate limits

### PR Has Conflicts
- Create new session to resolve
- Or manually resolve locally

---

## Related Documentation

- [Jules CLI Comparison](file:///home/sim/Obsi/Prods/01-pwf/_progress/research/jules_cli_comparison.md)
- [go-rod vs Playwright](file:///home/sim/Obsi/Prods/01-pwf/_progress/research/go-rod_vs_playwright.md)
- [jules-go Technical Docs](file:///home/sim/.gemini/antigravity/brain/1a496ec2-9f4a-45ce-ba83-19e8eec54c63/jules_go_technical_docs.md)

## Related Issues

- [TOOLS-139](https://napoveda.youtrack.cloud/issue/TOOLS-139): Session status summary
- [TOOLS-140](https://napoveda.youtrack.cloud/issue/TOOLS-140): Async bulk publish
- [TOOLS-141](https://napoveda.youtrack.cloud/issue/TOOLS-141): YouTrack sync
- [TOOLS-142](https://napoveda.youtrack.cloud/issue/TOOLS-142): PR status dashboard
- [TOOLS-143](https://napoveda.youtrack.cloud/issue/TOOLS-143): Priority queue (needs spec)
- [TOOLS-144](https://napoveda.youtrack.cloud/issue/TOOLS-144): Completion notifications
