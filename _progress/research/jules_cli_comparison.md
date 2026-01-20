# Jules CLI / API Comparison

Comparison of four Jules interfaces for session management.

## Feature Matrix

| Feature | Official `jules` CLI | Jules REST API | jules-mcp | jules-go |
|---------|---------------------|----------------|-----------|----------|
| **Create session** | ✅ `jules new "prompt"` | ✅ | ✅ `create_session` | ✅ `NewSession()` |
| **List sessions** | ✅ `jules remote list --session` | ✅ | ✅ `list_sessions` | ✅ `ListSessions()` |
| **Get session details** | ❌ | ✅ | ✅ `get_session` | ✅ `GetSession()` |
| **Send message to running session** | ❌ | ✅ | ✅ `send_session_message` | ❌ |
| **Approve plan** | ❌ | ✅ | ✅ `approve_session_plan` | ❌ |
| **Pull results** | ✅ `jules remote pull` | ❌ | ❌ | ❌ |
| **Teleport (clone+checkout)** | ✅ `jules teleport <id>` | ❌ | ❌ | ❌ |
| **List activities** | ❌ | ✅ | ✅ `list_activities` | ❌ |
| **Wait for completion** | ❌ | ❌ | ✅ `wait_for_session_completion` | ❌ |
| **Aggregate status** | ❌ | ❌ | ❌ | ❌ |
| **YouTrack sync** | ❌ | ❌ | ❌ | ❌ (planned TOOLS-141) |
| **PR status dashboard** | ❌ | ❌ | ❌ | ❌ (planned TOOLS-142) |
| **Publish PR** | ❌ | ❌ | ❌ | ✅ Browser automation |
| **Pagination** | ❔ (unclear) | ✅ | ✅ `page_token` | ✅ `NextPageToken` |

## Key Findings

### 1. Sending Messages to Running Sessions
**Only `jules-mcp` supports this!**
```
mcp_jules-mcp_send_session_message(session_id, prompt)
```
Neither official CLI nor jules-go can interact with sessions after creation.

### 2. Approving Plans
**Only `jules-mcp` supports this!**
```
mcp_jules-mcp_approve_session_plan(session_id)
```

### 3. Waiting for Completion
**Only `jules-mcp` supports this!**
```
mcp_jules-mcp_wait_for_session_completion(session_id, timeout)
```

### 4. Local Operations (Pull/Teleport)
**Only official CLI supports these!**
- `jules remote pull --session <id>` - downloads result
- `jules teleport <id>` - clones repo + checks out branch

### 5. Browser Automation (Publish)
**Only jules-go supports this!**
- Uses go-rod to click "Publish PR" in Jules UI
- No API for publishing currently

## Recommendations

| Use Case | Best Tool |
|----------|-----------|
| Create sessions | Official CLI (`jules new`) |
| Monitor/wait for completion | jules-mcp |
| Send follow-up messages | jules-mcp |
| Approve plans | jules-mcp |
| Pull results locally | Official CLI |
| Publish PRs | jules-go (browser) |
| YouTrack integration | jules-go (planned) |
| PM orchestration | Combination of all three |

## Installation

### Official jules CLI
```bash
go install github.com/jiahao42/jules-cli@latest
```

### jules-mcp
Configured in `.gemini/settings.json` as MCP server.

### jules-go
Located at `agents/jules-go/`. Build with:
```bash
go build -o jules-cli ./cmd/jules-cli/
```

## Related Issues

- [TOOLS-139](https://napoveda.youtrack.cloud/issue/TOOLS-139): Session state summary
- [TOOLS-140](https://napoveda.youtrack.cloud/issue/TOOLS-140): Async bulk publish
- [TOOLS-141](https://napoveda.youtrack.cloud/issue/TOOLS-141): YouTrack sync
- [TOOLS-142](https://napoveda.youtrack.cloud/issue/TOOLS-142): PR status dashboard
- [TOOLS-137](https://napoveda.youtrack.cloud/issue/TOOLS-137): Non-blocking publishing
- [TOOLS-138](https://napoveda.youtrack.cloud/issue/TOOLS-138): Unified browser pool
