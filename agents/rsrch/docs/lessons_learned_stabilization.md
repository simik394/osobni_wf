# Lessons Learned: Rsrch Stabilization & Modularization

## 1. Architectural Insights
- **Monoliths are deceptive**: A 1,700+ LoC "God Object" like `GraphStore` hides subtle dependencies. Splitting it revealed that orchestration (linking sessions to docs) should be a separate domain from storage (saving a turn).
- **Facade Pattern is Essential**: When refactoring core infrastructure, using a Facade pattern maintains backward compatibility for consumers (CLI, Server) while allowing internal modularity. This reduced the risk of "breaking the world."
- **REST vs direct coupling**: The transition of `Watcher` to REST polling significantly improved system stability by removing the need for a persistent, heavy browser client in the background service.

## 2. Technical Findings (NotebookLM)
- **ARIA > Text**: UI selectors based on visible text (e.g., "Generating...") are brittle across languages and updates. ARIA roles (e.g., `[role="progressbar"]`) and data attributes are much more resilient.
- **Metadata first**: Storing system-level flags (e.g., `isSystem`) on artifacts at the time of discovery is better than trying to "deduce" them later by slicing lists or matching names.

## 3. Process Improvements
- **TSC is the final judge**: Even if code "looks" correct, running `npx tsc --noEmit` is mandatory after major refactoring to catch missing methods in secondary consumers (like legacy CLI commands).
- **Mocking is hard**: When unit testing deeply coupled facades, mocking the underlying database driver (FalkorDB) is often more reliable than trying to mock the intermediate modules themselves.

## 4. Next Steps for Rsrch
- **Self-Correction**: The next phase should focus on agentic self-correction—if a selector fails, the agent should be able to "look around" and find the new one automatically.
- **Intelligent Batching**: Now that citations are modular, we can implement intelligent citation deduplication across multiple research sessions.
