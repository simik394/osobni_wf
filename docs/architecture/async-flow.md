# Async Architecture: Windmill & FalkorDB Integration (TOOLS-132)

## Problem
The current `rsrch` agent handles asynchronous tasks (Deep Research, Audio Generation) using:
1.  In-memory promises (detached from HTTP request).
2.  Ad-hoc FalkorDB status updates.
3.  Unsafe page reuse in `GeminiClient` (Risk of race conditions).

This approach is fragile (lost on restart) and lacks concurrency control (multiple async jobs might clobber the same browser tab).

## Solution
Offload job orchestration to **Windmill** and state persistence to **FalkorDB**, treating `rsrch` as a "Browser Capability Service".

### Key Components

1.  **FalkorDB (State of Truth)**
    - Nodes: `Job` (id, type, status, params, result).
    - Status: `queued` -> `processing` -> `completed` | `failed`.
    - Relationships: `(:Job)-[:BELONGS_TO]->(:Session)`.

2.  **Windmill (Orchestrator)**
    - Role: Manage queue, retries, and concurrency limits.
    - Scripts: `rsrch/dispatcher` (Generic), `rsrch/worker` (Task specific).

3.  **Rsrch Server (Capability Provider)**
    - Role: Execute browser actions *synchronously* when commanded by a Worker.
    - Endpoints:
        - `POST /internal/perform-deep-research` (Blocking, exclusive lock on a tab).
        - `POST /jobs/queue` (Public, creates Job + Triggers Windmill).

### Data Flow

```mermaid
sequenceDiagram
    participant Client
    participant RsrchAPI as Rsrch API (3001)
    participant FalkorDB
    participant Windmill
    participant Worker as Windmill Worker

    Client->>RsrchAPI: POST /deep-research/start
    RsrchAPI->>FalkorDB: CREATE (j:Job {status: 'queued'})
    RsrchAPI->>Windmill: Webhook (Trigger Worker with jobId)
    RsrchAPI->>Client: Return { jobId, status: 'queued' }

    Windmill->>Worker: Start Job
    Worker->>FalkorDB: SET status = 'processing'
    
    Worker->>RsrchAPI: POST /internal/perform-deep-research {jobId}
    Note right of RsrchAPI: Takes exclusive lock on a Tab.\nPerforms work.\nReturns result.
    
    RsrchAPI-->>Worker: JSON Result
    
    Worker->>FalkorDB: SET status = 'completed', result = ...
    Worker->>Windmill: Success
```

### Implementation Steps

1.  **Refactor `server.ts`**:
    - Move logic from `(async () => { ... })` into dedicated "Internal" endpoints (e.g., `_executeDeepResearch`).
    - Ensure these internal endpoints allocate a *Fresh* or *Locked* tab.

2.  **Create Windmill Script (`rsrch/worker`)**:
    - Input: `jobId`, `jobType`.
    - Logic:
        - Fetch Job params mainly for validation.
        - Call `RsrchAPI` internal endpoint (long timeout).
        - Handle failures (update DB to failed).

3.  **Concurrency Control**:
    - Define `MAX_CONCURRENT_JOBS` in Windmill (e.g., 2 workers).
    - This implicitly limits browser tab usage without complex semaphore logic in Node.js.

4.  **Migration**:
    - Update `agents/rsrch/src/server.ts` to use `WindmillClient.executeJob` instead of in-memory promises.

## Benefits
- **Persistence**: Jobs survive server restarts (Windmill retry).
- **Scalability**: Can scale workers independently of the API server (if using remote browsers).
- **Safety**: Windmill prevents overloading the browser by limiting concurrent worker execution.
