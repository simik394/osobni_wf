# Conversation Export Specification

> **Status**: Draft  
> **Date**: 2025-12-29

## 1. Overview

Export scraped conversations from FalkorDB to Markdown or JSON files for archival, backup, or external processing.

## 2. Goals

1. Export all or selected conversations to files
2. Support delta export (only changes since last export)
3. Include full content: prompts, responses, thinking, research docs, sources
4. Generate Obsidian-compatible markdown with proper formatting

## 3. Export Formats

### 3.1 Markdown Format

```markdown
---
platform: gemini
sessionId: abc123
title: "Research on Quantum Computing"
type: deep-research
exportedAt: 2025-12-29T01:00:00Z
capturedAt: 2025-12-28T23:00:00Z
---

# Research on Quantum Computing

## Conversation

### User
What is quantum entanglement?

### Assistant
[Response content with preserved formatting]

#### Thinking
> [Collapsed reasoning steps, now expanded]

---

## Research Documents

### Document: Quantum Entanglement Explained

[Document body content]

#### Sources Used
| # | Title | URL |
|---|-------|-----|
| 1 | [Source Title](https://example.com) | example.com |

#### Sources Consulted (Not Cited)
| # | Title | URL |
|---|-------|-----|
| 1 | [Unused Source](https://other.com) | other.com |
```

### 3.2 JSON Format

```json
{
  "platform": "gemini",
  "sessionId": "abc123",
  "title": "Research on Quantum Computing",
  "type": "deep-research",
  "exportedAt": "2025-12-29T01:00:00Z",
  "capturedAt": "2025-12-28T23:00:00Z",
  "turns": [
    { "role": "user", "content": "What is..." },
    { "role": "assistant", "content": "...", "thinking": "..." }
  ],
  "researchDocs": [
    {
      "title": "Document Title",
      "generatedAt": "2025-12-28T22:00:00Z",
      "content": "...",
      "sourcesUsed": [...],
      "sourcesUnused": [...]
    }
  ]
}
```

## 4. CLI Commands

```bash
# Export single session
rsrch gemini export <session-id> [--format md|json] [--output <path>]

# Export all synced conversations
rsrch graph export [--platform gemini|perplexity] [--format md|json] [--output <dir>]

# Export only changes since date
rsrch graph export --since "2025-12-01" [--output <dir>]

# Export with delta tracking (uses last export timestamp)
rsrch graph export --delta [--output <dir>]
```

## 5. API Endpoints

### POST /export/conversation

Export a specific conversation.

**Request:**
```json
{
  "sessionId": "abc123",
  "format": "md"
}
```

**Response:**
```json
{
  "success": true,
  "path": "/data/exports/abc123.md"
}
```

### POST /export/bulk

Export multiple conversations.

**Request:**
```json
{
  "platform": "gemini",
  "since": "2025-12-01T00:00:00Z",
  "format": "json",
  "outputDir": "/data/exports"
}
```

## 6. Integration Points

| Component | Integration |
|-----------|-------------|
| `graph-store.ts` | Add `getConversationsForExport(filters)` |
| `gemini-client.ts` | Use existing `scrapeConversations()` |
| `index.ts` | Add CLI commands |
| `server.ts` | Add API endpoints |

## 7. Delta Sync Design

### Hash-Based Change Detection

```typescript
interface ConversationMeta {
  platformId: string;
  contentHash: string;  // SHA256 of turns+docs
  lastExportedAt?: number;
}
```

On sync:
1. Compute hash of current content
2. Compare with stored hash
3. If different, mark as "changed"
4. On export --delta, only export changed conversations

---

# WBS

## Phase 1: Core Export ✅
- [x] Create `src/exporter.ts` module
- [x] Implement `exportToMarkdown(conversation)`
- [x] Implement `exportToJson(conversation)`
- [x] Add CLI command `rsrch graph export`

## Phase 2: Delta Tracking
- [ ] Add `contentHash` field to Conversation node in graph-store
- [ ] Compute hash on sync
- [ ] Implement `getChangedConversations(since)`
- [ ] Add `--delta` and `--since` CLI flags

## Phase 3: API Integration
- [ ] Add `/export/conversation` endpoint
- [ ] Add `/export/bulk` endpoint
- [ ] Update API.md documentation

## Phase 4: Testing
- [ ] Unit test markdown generation
- [ ] Integration test with real conversations
- [ ] Verify delta detection works
