# FalkorDB Functional Requirements Specification

This document defines the exact low-level requirements for the FalkorDB features.

## 1. Feature: Infrastructure State (Service Registry)
**Goal:** Maintain an up-to-date map of active services using Consul as the source of truth.

### 1.1 `ConsulSyncAdapter` (Service)
*   **Target Component:** `rsrch` (running as a sidecar or background thread).
*   **Mechanism:** Consul Blocking Queries (Long Polling).

#### `syncServicesFromConsul()`
*   **Input:** None (Bootstraps from environment `CONSUL_HTTP_ADDR`).
*   **Logic Loop:**
    1.  GET `/v1/catalog/services?wait=5m&index=$lastIndex`
    2.  **On Change (Index Update):**
        *   Fetch full catalog details for all services.
        *   **Transaction:**
            *   **Upsert Active:** For each service instance found:
                ```cypher
                MERGE (s:Service {id: $serviceId})
                SET s.name = $name, s.address = $address, s.port = $port, s.status = 'online', s.lastSeen = timestamp()
                ```
            *   **Soft Delete Missing:** For service IDs present in DB but missing in Consul response:
                ```cypher
                MATCH (s:Service {id: $missingId}) SET s.status = 'offline'
                ```
*   **Error Handling:**
    *   Connection failure: Exponential backoff (1s -> 30s).
    *   Consul reset (Index < lastIndex): Reset local index to 0.

### 1.2 `FalkorClient.resolveService`
*   **Input:** `serviceName: string`
*   **Output:** `Promise<{address: string, port: number} | null>`
*   **Logic:**
    1.  Query Consul DNS (`dig +short name.service.consul`).
    2.  Fallback: Query FalkorDB (Read-Rep) for last known endpoint if Consul unavailable.

---

## 2. Feature: Resource Allocation (Locking)
**Goal:** Prevent collisions on exclusive resources (e.g., Browser Profiles).

### 2.1 `FalkorClient.acquireLock`
*   **Input:** `resourcePath: string`, `sessionId: string`, `ttlSeconds: number`
*   **Output:** `Promise<boolean>` (Success/Fail)
*   **Logic:**
    1.  **Atomic Check-and-Set (Redlock or SETNX):**
        *   Key: `lock:resource:${hash(resourcePath)}`
        *   Value: `sessionId`
        *   TTL: `$ttlSeconds`
    2.  **Graph Sync (Async):**
        *   If Redis storage succeeds:
            ```cypher
            MERGE (r:Resource {path: $resourcePath})
            SET r.in_use = true, r.locked_by = $sessionId
            WITH r
            MATCH (s:Session {id: $sessionId})
            MERGE (s)-[:LOCKED]->(r)
            ```
*   **Side Effects:** Prevents other sessions from writing to user-data-dir.

### 2.2 `FalkorClient.releaseLock`
*   **Input:** `resourcePath: string`, `sessionId: string`
*   **Output:** `Promise<void>`
*   **Logic:**
    1.  **Validate:** Check if Redis key value == `sessionId`.
    2.  **Delete:** `DEL key`.
    3.  **Graph Sync:**
        ```cypher
        MATCH (r:Resource {path: $resourcePath})
        SET r.in_use = false, r.locked_by = null
        DELETE (s)-[l:LOCKED]->(r)
        ```

---

## 3. Feature: Project Context (File Tracking)
**Goal:** Automatically link Sessions to modified Files.

### 3.1 `AngravToolScraper` (UI Observer)
*   **Target Component:** `angrav/src/session.ts`
*   **Input:** DOM MutationObserver on Chat Container.
*   **Regex Trigger:** `/(Reading|Writing|Updating) file:? ([\w./-]+)/i`
*   **Logic:**
    1.  Detect match in new message node.
    2.  Extract `filePath`.
    3.  Call `falkor.logInteraction(sessionId, 'action', 'file_modification', messageText)`.
    4.  **Graph Extension:**
        ```cypher
        MATCH (s:Session {id: $sessionId})
        MERGE (f:File {path: $filePath})
        MERGE (s)-[m:MODIFIED]->(f)
        SET m.timestamp = timestamp()
        ```

### 3.2 `RsrchToolMiddleware` (Code Wrapper)
*   **Target Component:** `rsrch/src/client.ts`
*   **Logic:**
    1.  Wrap `write_to_file`.
    2.  On success, execute the same Graph Extension query as above.

### 3.3 `Librarian.autoScanListener`
*   **Trigger:** Redis Pub/Sub channel `file_changed`.
*   **Logic:**
    1.  Receive `{path: string}`.
    2.  Debounce (30s window per file).
    3.  Execute shell: `./librarian analyze --file $path`.
    4.  Side Effect: Librarian updates `(:File)` node properties (imports, symbols).

---

## 4. Feature: Cost Tracking
**Goal:** Monitor token and budget usage.

### 4.1 `FalkorClient.trackCost`
*   **Input:** `sessionId: string`, `model: string`, `inputTokens: number`, `outputTokens: number`
*   **Pricing Data:** Hardcoded map or config (e.g., GPT-4o: $5.00/1M in, $15.00/1M out).
*   **Logic:**
    1.  Calculate `costUsd`.
    2.  **Graph Update:**
        ```cypher
        MATCH (s:Session {id: $sessionId})
        CREATE (c:Cost {
            id: uuid(),
            model: $model,
            tokens: $input + $output,
            amountUsd: $costUsd,
            timestamp: timestamp()
        })
        CREATE (s)-[:INCURRED]->(c)
        ```

---

## 5. Feature: Work Hierarchy
**Goal:** Structure linear sessions into Goals > Tasks.

### 5.1 `FalkorClient.createTask`
*   **Input:** `goalId: string`, `title: string`, `description: string`
*   **Output:** `taskId: string`
*   **Cypher:**
    ```cypher
    MATCH (g:Goal {id: $goalId})
    CREATE (t:Task {
        id: uuid(),
        title: $title,
        status: 'pending',
        createdAt: timestamp()
    })
    CREATE (g)-[:HAS_SUBTASK]->(t)
    ```

### 5.2 Context Injection
*   **Requirement:** Agent entrypoints must accept `--task-id <UUID>`.
*   **Logic:**
    *   On Session Creation:
        ```cypher
        MATCH (t:Task {id: $taskId})
        MATCH (s:Session {id: $sessionId})
        MERGE (t)-[:EXECUTED_IN]->(s)
        ```

---

## 6. Feature: Structured Knowledge (Lessons Learned)
**Goal:** Make `LESSONS_LEARNED.md` queryable by agents to prevent repeating mistakes.

### 6.1 `KnowledgeBase.syncFromMarkdown`
*   **Target Component:** `rsrch/src/knowledge.ts`
*   **Input:** Path to `LESSONS_LEARNED.md` (e.g., `/home/sim/Obsi/Prods/01-pwf/LESSONS_LEARNED.md`).
*   **Parsing Logic:**
    1.  **Regex:** Split file by `## Topic` or `- **Title**:` entries.
    2.  Extract `Problem` (usually the header or "Issue:" bullet).
    3.  Extract `Solution` (text following "Fix:" or "Solution:").
    4.  Extract `Tags` (from context headers).
*   **Graph Update (Transaction):**
    ```cypher
    MERGE (t:Topic {name: $topic})
    MERGE (p:Problem {description: $problem})
    MERGE (s:Solution {description: $solution})
    MERGE (p)-[:RELATED_TO]->(t)
    MERGE (p)-[:SOLVED_BY]->(s)
    ```

### 6.2 `retrieveKnownSolutions` (Tool)
*   **Input:** `query: string`, `errorSignature?: string` (e.g., "TimeoutError").
*   **Logic:**
    1.  **Semantic Search (Vector) / Keyword Match:**
        *   If `errorSignature` provided:
            ```cypher
            MATCH (p:Problem)-[:SOLVED_BY]->(s:Solution)
            WHERE p.description CONTAINS $errorSignature OR p.signature CONTAINS $errorSignature
            RETURN p.description, s.description, s.codeSnippet
            ```
        *   If generic query: Full-text search on Problem nodes.
*   **Output:** List of `{ problem: string, solution: string }`.

### 6.3 `logLessonLearned` (Tool)
*   **Input:** `topic: string`, `problem: string`, `solution: string`
*   **Logic:**
    1.  **Graph Update:** Insert nodes as above.
    2.  **File Sync (Inverse):** Append to `LESSONS_LEARNED.md`:
        ```markdown
        ### $topic
        - **Problem**: $problem
        - **Solution**: $solution
        ```
    *   *Constraint:* Single source of truth. Ideally graph-first, then dump to MD for humans.
