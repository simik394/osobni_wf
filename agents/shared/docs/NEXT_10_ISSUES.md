# Next 10 Implementation Issues

Here are the 10 prioritized issues to implement the Graph Automation Spec, ordered by dependency and impact.

## Phase 1: Foundation (Infrastructure)
1.  **[Infra] Consul Sync Adapter**: Create utility to sync Consul Catalog state (services/nodes) to FalkorDB `(:Service)` nodes for graph context.
2.  **[Shared] Consul Client Wrapper**: Add helper methods to `FalkorClient` (or new `InfraClient`) to query Consul for active service endpoints.
3.  **[Shared] Implement `ResourceLocking`**: Add atomic `acquireLock` / `releaseLock` methods (FalkorDB-based for rich session context).

## Phase 2: Context Awareness (Files & Projects)
4.  **[Shared] Create `ToolMiddleware` System**: A generic wrapper to intercept tool calls (for use in `rsrch` and other local agents).
5.  **[Angrav] Implement `ToolScraper`**: Add DOM observers to `angrav/src/session.ts` to capture tool execution events from the UI and log them to FalkorDB.
6.  **[Rsrch] Integrate Tool Middleware**: Apply the middleware wrapper to `rsrch`'s ecosystem Callers.
7.  **[Librarian] Auto-Scan Listener**: Create a lightweight service (or function) that listens for `file_changed` events and triggers Librarian re-scans.

## Phase 3: Work & Logic
8.  **[CLI] Context Injection (`--task`)**: Add support for passing a parent `taskId` to agents (CLI arg & API header).
9.  **[Shared] Task Progress Parser**: Implement logic to detect checkmarks (`[x]`) in agent output and update `(:Task)` status in DB.
10. **[Angrav] Cost Tracking**: Implement `trackCost` hook to log token usage per interaction, linking it to the active Session/Budget.
