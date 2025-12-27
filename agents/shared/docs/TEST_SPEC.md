# FalkorDB Integration Test Specification

This document maps the Functional Requirements to specific test cases to ensure coverage.

**Test Runner**: Jest
**Location**: `@agents/shared/test/`

## 1. Infrastructure State (Consul Sync)
*Requirements 1.1, 1.2*

### Test 1.1: Consul Sync
- **Scenario**: Sync services from a mocked Consul response.
- **Setup**: Mock `fetch/axios` to return a standard Consul Catalog JSON response.
- **Action**: Call `syncServicesFromConsul()`.
- **Assertion**:
    - Verify `(:Service)` nodes are created/updated in FalkorDB with correct IPs.
    - Verify `status` is 'online'.
    - Verify a "missing" service (removed from mock) gets `status: 'offline'`.

### Test 1.2: Service Resolution
- **Scenario**: Resolve a service endpoint.
- **Setup**: Seed FalkorDB with a Service node `{name: 'test-svc', address: '1.2.3.4'}`.
- **Action**: Call `resolveService('test-svc')`.
- **Assertion**: Returns `{address: '1.2.3.4'}` (simulating fallback if Consul is unreachable or parsing DB cache).

## 2. Resource Allocation (Locking)
*Requirements 2.1, 2.2*

### Test 2.1: Acquire Lock
- **Scenario**: Successfully acquire a free lock.
- **Action**: `acquireLock('/tmp/profile1', 'session-A', 30)`.
- **Assertion**:
    - Returns `true`.
    - Redis key `lock:resource:...` exists with value 'session-A'.
    - Graph query `MATCH (r:Resource {in_use: true})` returns the node.

### Test 2.2: Contested Lock
- **Scenario**: Fail to acquire a busy lock.
- **Setup**: Pre-set Redis key for 'session-A'.
- **Action**: Call `acquireLock('/tmp/profile1', 'session-B')`.
- **Assertion**: Returns `false`. Graph remains unchanged.

### Test 2.3: Release Lock
- **Action**: `releaseLock('/tmp/profile1', 'session-A')`.
- **Assertion**: Redis key deleted. Graph node `in_use` set to `false`.

## 3. Project Context (File Tracking)
*Requirements 3.1, 3.2, 3.3*

### Test 3.1: Regex Parser (Unit)
- **Scenario**: Parse Angrav UI messages.
- **Input**: "Reading file: /src/server.ts" and "Writing file /src/config.ts".
- **Assertion**: Correctly extracts `/src/server.ts` and `/src/config.ts`.

### Test 3.2: Graph Linkage
- **Scenario**: Log a file modification.
- **Action**: `falkor.logInteraction(sid, 'action', 'file_modification', 'User wrote file X')`.
- **Assertion**: Query `MATCH (s:Session)-[:MODIFIED]->(f:File)` returns the link to file X.

## 4. Cost Tracking
*Requirement 4.1*

### Test 4.1: Cost Calculation
- **Scenario**: Track token usage.
- **Action**: `trackCost(sid, 'gpt-4', 1000, 1000)`.
- **Assertion**:
    - `(:Cost)` node created with `amountUsd` > 0.
    - `tokens` = 2000.
    - Linked via `[:INCURRED]`.

## 5. Work Hierarchy
*Requirements 5.1, 5.2*

### Test 5.1: Task Creation
- **Action**: `createTask(goalId, 'Refactor Auth', '...')`.
- **Assertion**: New `(:Task)` node linked via `[:HAS_SUBTASK]` to Goal.

## 6. Structured Knowledge
*Requirements 6.1, 6.2*

### Test 6.1: Markdown Parsing
- **Scenario**: Parse a standard `LESSONS_LEARNED.md` fixture.
- **Input**: Markdown with `## Topic` and `- **Issue**: ...`.
- **Assertion**: Parser returns structured objects: `[{topic: '...', problem: '...', solution: '...'}]`.

### Test 6.2: Solution Retrieval
- **Scenario**: Query for a known problem.
- **Setup**: Seed graph with Problem "TimeoutError".
- **Action**: `retrieveKnownSolutions('TimeoutError')`.
- **Assertion**: Returns the specific solution string.
