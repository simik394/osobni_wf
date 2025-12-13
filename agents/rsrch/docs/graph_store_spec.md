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
┌─────────────────────────────────────────────────────────────┐
│                      FalkorDB Graph                         │
├─────────────────────────────────────────────────────────────┤
│  (:Job)           - id, type, status, query, createdAt      │
│  (:Entity)        - id, type, name, properties              │
│  (:Fact)          - id, content, context, createdAt         │
│  (:Agent)         - id                                       │
│                                                             │
│  [:DEPENDS_ON]    - Job → Job (workflow dependencies)       │
│  [:RELATES_TO]    - Entity → Entity (knowledge links)       │
│  [:KNOWS]         - Agent → Fact (agent memory)             │
│  [:PRODUCED]      - Job → Entity (provenance)               │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 Key Operations

| Operation | Description |
|-----------|-------------|
| `addJob()` | Create queued job node |
| `getNextQueuedJob()` | FIFO queue retrieval |
| `updateJobStatus()` | Transition job state |
| `addEntity()` | Add knowledge node |
| `addRelationship()` | Link entities |
| `storeFact()` | Store agent memory |
| `getFacts()` | Retrieve agent memory |

## 5. CLI Commands

```bash
# Future CLI extensions
rsrch graph status            # Show FalkorDB connection status
rsrch graph jobs [--status]   # List jobs from graph
rsrch graph entities [type]   # List knowledge entities
rsrch graph agent-facts <id>  # Show facts for agent
```

## 6. Integration Points

| Workflow | Current | After |
|----------|---------|-------|
| `/deep-research` | `jobQueue.add()` | `graphStore.addJob()` |
| `/research-to-podcast` | `jobQueue.*` | `graphStore.*` |
| Server job polling | `jobQueue.getNextQueuedJob()` | `graphStore.getNextQueuedJob()` |
| Artifact registry | Separate storage | Link via graph relationships |

---

# Work Breakdown Structure

## Phase 1: Core Infrastructure ✅
- [x] Add FalkorDB to `docker-compose.yml`
- [x] Install `falkordb` npm package
- [x] Create `src/graph-store.ts` module
  - [x] Connection management
  - [x] Job queue operations
  - [x] Knowledge base operations
  - [x] Agent memory operations

## Phase 2: Testing
- [ ] Start FalkorDB container
- [ ] Write `tests/graph-store.test.ts`
  - [ ] Test job CRUD operations
  - [ ] Test entity/relationship operations
  - [ ] Test agent memory operations
- [ ] Run tests: `npx ts-node tests/graph-store.test.ts`

## Phase 3: Migration
- [ ] Create adapter layer in `src/job-queue.ts`
  - [ ] Option to use graph-store as backend
  - [ ] Fallback to JSON for backward compatibility
- [ ] Update server endpoints to use graph-store
- [ ] Test with existing workflows

## Phase 4: CLI Extensions
- [ ] Add `rsrch graph status` command
- [ ] Add `rsrch graph jobs` command
- [ ] Add `rsrch graph entities` command
- [ ] Update USER_GUIDE.md

## Phase 5: Agent Memory Schema
- [ ] Design conversation history structure
- [ ] Design fact extraction patterns
- [ ] Implement `storeConversation()` method
- [ ] Implement `getRelevantContext()` method

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
