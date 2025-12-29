# Conversation Scraper Specification

> **Status**: Draft  
> **Date**: 2025-12-13

## 1. Overview

Scrape conversation history from AI platforms (Gemini, Perplexity) and store it in FalkorDB for analysis, search, and continuity tracking.

## 2. Problem Statement

- Conversation history is scattered across AI platforms with no unified view
- No way to search across all past interactions
- History is lost if platform clears sessions
- Cannot correlate conversations with generated artifacts (docs, audio)

## 3. Goals

1. Scrape conversation sessions from Gemini sidebar with pagination
2. Handle **Deep Research** sessions separately (click research doc to view content)
3. Extract full message history (user prompts + AI responses) per session
4. Store in FalkorDB with proper conversation/turn structure
5. Record **capture time** for each sync operation
6. Provide content filtering (questions only, answers only, etc.)
7. Support incremental sync with limit/offset

## 4. Technical Design

### 4.1 Platform Coverage

| Platform | Session Listing | Message Extraction | Deep Research | Priority |
|----------|-----------------|-------------------|---------------|----------|
| Gemini | `div.conversation[role="button"]` | Click → scroll → extract turns | Click doc in panel (one at a time) | P0 |
| Perplexity | Thread list in sidebar | Already have thread IDs | N/A | P1 |

### 4.2 Data Model (extends graph-store)

```
(Agent {id: "gemini"})
  -[:HAD]-> (Conversation {
    id,
    platformId,
    platform,
    title,
    type: "regular" | "deep-research",
    createdAt,
    capturedAt      // When we scraped this
  })
    -[:HAS_TURN]-> (Turn {role, content, timestamp?})
      -[:NEXT]-> (Turn...)
    -[:HAS_RESEARCH_DOC]-> (ResearchDoc {title, content, capturedAt})
```

**Conversation properties:**
- `id`: Internal ID (e.g., `conv_abc123`)
- `platformId`: Platform's session ID (for dedup)
- `platform`: "gemini" | "perplexity"
- `title`: Session title from sidebar
- `type`: "regular" | "deep-research"
- `createdAt`: When conversation started (if extractable)
- `capturedAt`: Timestamp of this sync

**Turn properties:**
- `role`: "user" | "assistant"
- `content`: Message text (raw, preserving any markdown from source)
- `timestamp`: Per-message timestamp (if available from DOM)

**ResearchDoc properties (Deep Research only):**
- `title`: Document heading
- `content`: Main document text with inline citations as Obsidian footnotes
- `sources`: Array of `{id, text, url, domain}` - extracted from sources panel
- `reasoningSteps`: Array of `{phase, action}` - model's thought process
- `capturedAt`: When captured

**Inline Citation Format (Obsidian footnotes):**
```markdown
The study found significant results[^1] in the population[^2].

[^1]: [Source Title](https://example.com) - domain.com
[^2]: [Another Source](https://other.com) - other.com
```

> **Note**: Existing `extractContent()` already parses citations and reasoning - reuse that logic.
> The new requirement is converting inline citation markers (e.g., `[1]`, `[2]`) to Obsidian footnote format `[^1]`.

### 4.3 Extraction Strategy

#### Regular Conversations
1. Navigate to gemini.google.com
2. Ensure sidebar visible
3. List sessions (with limit + offset pagination)
4. For each session:
   a. Click to open
   b. Wait for chat load
   c. Scroll to load full history
   d. Extract turns (role + content + timestamp if available)
   e. Store with `capturedAt = now()`

#### Deep Research Sessions
1. Detect by presence of `deep-research-immersive-panel`
2. Click on research document in panel to view
3. Extract document content (only one visible at a time)
4. Store as `ResearchDoc` linked to conversation

### 4.4 Message Extraction Selectors (Gemini)

```typescript
// User messages
const userMessages = page.locator('div[data-author-role="user"]');

// Assistant responses  
const assistantMessages = page.locator('div[data-author-role="model"]');

// Timestamp (if available)
const timestamp = turn.locator('time, [data-timestamp]');
```

> **Note**: Selectors need validation. DOM structure may vary.

## 5. CLI Commands

### Scraping Commands (Separate per platform)

```bash
# Gemini conversations
rsrch gemini sync-conversations [--limit=N] [--offset=M] [--local] [--headed]

# Perplexity conversations (future)
rsrch perplexity sync-conversations [--limit=N] [--offset=M] [--local]
```

### Viewing Commands (with content filters)

```bash
# List synced conversations
rsrch graph conversations [--platform=gemini|perplexity] [--limit=N]

# View specific conversation
rsrch graph conversation <id> [--questions-only] [--answers-only] [--full]

# Search across all conversations
rsrch graph search "keyword" [--platform=gemini]
```

### Content Filter Options

| Flag | Effect |
|------|--------|
| `--questions-only` | Show only user turns |
| `--answers-only` | Show only assistant turns |
| `--full` | Show all content (default) |
| `--research-docs` | Include research documents (deep research) |

## 6. Integration Points

| Workflow | Hook |
|----------|------|
| `gemini-client.ts` | Add `scrapeConversations(limit, offset)` method |
| `graph-store.ts` | Add `syncConversation()` with upsert, add `getConversationsByPlatform()` |
| `index.ts` | Add CLI commands |

## 7. Error Handling

- **Rate limiting**: 500ms delay between session clicks
- **DOM changes**: Multiple selector fallbacks
- **Large history**: Use limit/offset pagination
- **Partial failure**: Continue, log failed sessions

---

# Work Breakdown Structure

## Phase 1: Gemini Conversation Scraper ✅
- [x] Add `scrapeConversations(limit, offset)` to `gemini-client.ts`
  - [x] Paginate sessions from sidebar
  - [x] Detect regular vs deep-research sessions
  - [x] Extract turns (role, content, timestamp if available)
  - [x] Handle deep research doc expansion
- [x] Return structured data with `capturedAt`

## Phase 2: Graph Storage ✅
- [x] Add `syncConversation()` to `graph-store.ts`
  - [x] Upsert by platformId
  - [x] Store conversation with capturedAt
  - [x] Insert turns with relationships
  - [x] Handle ResearchDoc for deep research
- [x] Add `getConversationsByPlatform(platform, limit)`
- [x] Add `getConversationWithFilters(id, filters)`

## Phase 3: CLI Integration ✅
- [x] `rsrch gemini sync-conversations --limit --offset`
- [x] `rsrch graph conversations --platform`
- [x] `rsrch graph conversation <id> --questions-only --answers-only`

## Phase 4: Testing
- [x] Run sync on Gemini account
- [x] Verify filtering works
- [ ] Test deep research extraction

## Phase 5: Content Quality Improvements
- [x] **Code Block Preservation**
  - [x] Use `innerHTML()` instead of `innerText()` for extraction
  - [x] Convert HTML `<pre><code>` to markdown fenced blocks
  - [x] Preserve language hints from `class="language-*"`
  - [x] Maintain proper newlines inside code blocks
  
- [x] **Reasoning/Thinking Extraction**
  - [x] Expand collapsed "Show reasoning" sections before extraction
  - [x] Language-agnostic detection: match `Zobrazit uvažování` (CZ), `Show reasoning` (EN), or similar patterns
  - [ ] Store reasoning as separate field or inline with marker
  - [x] Click to expand toggle elements before reading content
  
- [x] **Content Formatting**
  - [x] Preserve markdown formatting (bold, italic, lists)
  - [ ] Handle tables properly
  - [x] Maintain heading hierarchy
  - [ ] Handle LaTeX/math expressions if present

- [ ] **Robustness**
  - [ ] Retry on transient scraping failures
  - [ ] Handle session timeout/re-auth
  - [x] Graceful degradation if element not found
  - [x] Log extraction warnings without failing entire sync

## Phase 6: Export to Files
> See [export_spec.md](file:///home/sim/Obsi/Prods/01-pwf/agents/rsrch/docs/export_spec.md)
- [ ] Implement markdown export
- [ ] Implement JSON export  
- [ ] Add delta/change tracking
- [ ] CLI commands for export


---

## Decisions Made

| Question | Decision |
|----------|----------|
| Deep Research handling | Click doc in panel, one at a time, store as ResearchDoc |
| Timestamps | Extract if available in DOM, otherwise null |
| Content format | Store raw (preserving markdown from source) |
| Platform commands | Separate: `gemini sync-conversations` vs `perplexity sync-conversations` |
| Pagination | `--limit` and `--offset` flags |
| Capture time | `capturedAt` stored per conversation sync |
| Content filtering | `--questions-only`, `--answers-only`, `--research-docs` flags |

---

## Known Issues (from Testing)

| Issue | Description | Priority | Status |
|-------|-------------|----------|--------|
| Code blocks truncated | `innerText()` flattens HTML structure, loses formatting | P1 | ✅ Fixed (`htmlToMarkdownSimple`) |
| Reasoning not expanded | "Zobrazit uvažování" / "Show reasoning" shows instead of actual thoughts | P1 | ✅ Fixed (`expandReasoningSections`) |
| Content truncation | Long messages may be cut off in CLI display (display issue, not storage) | P2 | Open |
| Re-sync doesn't update turns | Upsert only touches `capturedAt`, not conversation content | P2 | Open |
| No export to files | Cannot export conversations to markdown/JSON | P1 | In Design |
| No delta sync | Cannot track what changed since last sync | P2 | In Design |

