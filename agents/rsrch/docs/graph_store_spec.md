# Graph Store Specification

> **Status**: Draft  
> **Date**: 2024-12-13

## 1. Overview

Unified graph-based storage for job queues, knowledge base, and agent memory using FalkorDB.

## 2. Problem Statement

- Current `job-queue.ts` uses JSON file storage - no concurrent access, poor query
- No knowledge base for agent memory and semantic relationships
- No way to track lineage between research, artifacts, and agent actions
- Need single database that serves multiple agents in the personal assistant

## 3. Goals

1. Replace JSON-based job queue with graph-based storage
2. Provide knowledge base for entities and relationships
3. Support agent memory (facts, context, conversation history)
4. Enable concurrent access from multiple agents/processes
5. Maintain schemaless flexibility (no upfront schema required)

## 4. Technical Design

### 4.1 Data Model

```
┌─────────────────────────────────────────────────────────────────┐
│                      FalkorDB Graph                              │
├─────────────────────────────────────────────────────────────────┤
│  CORE NODES                                                      │
│  (:Job)           - id, type, status, query, createdAt           │
│  (:Session)       - id, platform, externalId, query, createdAt   │
│  (:Document)      - id, title, url, createdAt                    │
│  (:Audio)         - id, path, duration, createdAt                │
│                                                                  │
│  AGENT NODES                                                     │
│  (:Agent)         - id, name                                     │
│  (:Conversation)  - id, createdAt                                │
│  (:Turn)          - role, content, timestamp                     │
│                                                                  │
│  KNOWLEDGE (future)                                              │
│  (:Entity)        - id, type, name, properties                   │
│  (:Fact)          - id, content, source                          │
├─────────────────────────────────────────────────────────────────┤
│  LINEAGE RELATIONSHIPS (provenance tracking)                     │
│  [:STARTED]       - Job → Session                                │
│  [:EXPORTED_TO]   - Session → Document                           │
│  [:CONVERTED_TO]  - Document → Audio                             │
│  [:DEPENDS_ON]    - Job → Job (workflow chains)                  │
│                                                                  │
│  CONVERSATION RELATIONSHIPS                                      │
│  [:HAD]           - Agent → Conversation                         │
│  [:HAS_TURN]      - Conversation → Turn                          │
│  [:NEXT]          - Turn → Turn (sequence)                       │
│                                                                  │
│  KNOWLEDGE RELATIONSHIPS (future)                                │
│  [:MENTIONS]      - Document → Entity                            │
│  [:RELATES_TO]    - Entity → Entity                              │
└─────────────────────────────────────────────────────────────────┘
```

### 4.2 Lineage Example

```cypher
// Research → Export → Podcast flow
(:Job {type: 'deepResearch', query: 'coffee origins'})
  -[:STARTED]-> (:Session {platform: 'gemini', externalId: 'abc123'})
    -[:EXPORTED_TO]-> (:Document {id: 'K6Q-01', title: 'K6Q-01 Deep Research...'})
      -[:CONVERTED_TO]-> (:Audio {id: 'K6Q-01-audio', path: '...'})
```

### 4.3 Conversation Example

```cypher
(:Agent {id: 'rsrch-cli'})
  -[:HAD]-> (:Conversation {id: 'conv-001', createdAt: 1702...})
    -[:HAS_TURN]-> (:Turn {role: 'user', content: 'Research coffee'})
      -[:NEXT]-> (:Turn {role: 'assistant', content: 'Starting deep research...'})
```

### 4.4 Key Operations

| Operation | Description |
|-----------|-------------|
| **Job Queue** | |
| `addJob()` | Create queued job node |
| `getNextQueuedJob()` | FIFO queue retrieval |
| `updateJobStatus()` | Transition job state |
| **Lineage** | |
| `linkJobToSession()` | Job → Session |
| `linkSessionToDocument()` | Session → Document |
| `linkDocumentToAudio()` | Document → Audio |
| `getLineage()` | Trace full provenance chain |
| **Conversations** | |
| `startConversation()` | Create conversation for agent |
| `addTurn()` | Add user/assistant turn |
| `getConversation()` | Retrieve conversation history |

## 5. CLI Commands

```bash
rsrch graph status            # Show FalkorDB connection status
rsrch graph jobs [--status]   # List jobs from graph
rsrch graph lineage <id>      # Show provenance chain for artifact
rsrch graph conversations     # List recent conversations
```

## 6. Integration Points

| Workflow | Current | After |
|----------|---------|-------|
| `/deep-research` | `jobQueue.add()` | `graphStore.addJob()` + lineage |
| `/research-to-podcast` | `jobQueue.*` | `graphStore.*` + full lineage chain |
| Artifact registry | Separate JSON | Merged into graph nodes |
| Job polling | `jobQueue.getNextQueuedJob()` | `graphStore.getNextQueuedJob()` |

---

# Work Breakdown Structure

## Phase 1: Core Infrastructure ✅
- [x] Add FalkorDB to `docker-compose.yml`
- [x] Install `falkordb` npm package
- [x] Create `src/graph-store.ts` module
  - [x] Connection management
  - [x] Job queue operations
  - [x] Basic entity operations

## Phase 2: Testing ✅
- [x] Start FalkorDB container
- [x] Write `tests/graph-store.test.ts`
  - [x] Test job CRUD operations
  - [x] Test connection handling
- [x] Run tests: `npx ts-node tests/graph-store.test.ts`

## Phase 3: Lineage Tracking ✅
- [x] Add lineage node types (Session, Document, Audio)
- [x] Implement `createSession()`, `createDocument()`, `createAudio()`
- [x] Implement `linkJobToSession()`
- [x] Implement `linkSessionToDocument()`
- [x] Implement `linkDocumentToAudio()`
- [x] Implement `getLineage()` and `getLineageChain()` traversals

## Phase 4: Replace JSON Job Queue ⏸️
- [ ] Update server to use graph-store
- [ ] Delete `src/job-queue.ts`
- [ ] Delete `data/jobs.json`
- [ ] Test all existing endpoints

## Phase 5: Conversation History ✅
- [x] Add conversation node types
- [x] Implement `startConversation()`
- [x] Implement `addTurn()`
- [x] Implement `getConversation()`
- [x] Implement `getRecentConversations()`

## Phase 6: CLI Extensions ⏸️
- [ ] `rsrch graph status`
- [ ] `rsrch graph lineage <id>`
- [ ] Update USER_GUIDE.md

---

## Deployment

### Docker
```bash
docker compose up falkordb -d
```

### Connection
```typescript
import { getGraphStore } from './graph-store';
const store = getGraphStore();
await store.connect('localhost', 6379);  // Or 'falkordb' in Docker network
```

---

## Future Work (Nice-to-Have)

- [ ] Full-text search on entities
- [ ] Vector similarity for semantic search
- [ ] Graph visualization dashboard
- [ ] Export/import graph snapshots
