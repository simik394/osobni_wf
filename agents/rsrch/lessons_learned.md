# Lessons Learned - Rsrch Agent Refactoring

## Architectural Refactoring
- **Monolith Decomposition**: Breaking a 2500-line orchestrator into specialized routers (using Express/Windmill-friendly patterns) significantly improves readability and testability.
- **Service Dependency Injection**: Using a standard `dependencies` object for routers ensures that all modules use the same service instances (e.g., `NotificationService`, `PerplexityClient`).

## Configuration & Selectors
- **Zod-First Config**: Using Zod for environment validation prevents runtime errors due to missing secrets or malformed URLs.
- **Externalized Selectors**: Moving DOM selectors from hardcoded strings in clients to a unified `selectors.yaml` allows for rapid updates when target sites (Gemini, NotebookLM, Perplexity) change their UI.
- **Selector Types**: Keeping a TypeScript interface (`selectors.ts`) in sync with the YAML structure provides autocompletion and prevents typo-related bugs.

## Process & Safety
- **Systematic Cleanup**: When removing legacy modules (like `discord.ts` or `notify.ts`), it's essential to perform a global search for all imports and call sites.
- **Build-Driven Verification**: Frequent `npm run build` calls during the refactoring process help catch broken imports and type mismatches early.
- **Incremental Commits**: Committing logically complete chunks (e.g., "unified config", "modular routers") makes it easier to track progress and revert if necessary.

## Modular Action Architecture
- **Stateless Actions**: Making client methods stateless and moving them to a dedicated `actions/` directory allows for easier unit testing and cross-agent dependency injection.
- **UniversalContext Pattern**: Standardizing the context (`page`, `log`, `db`) across different agents (Gemini, NotebookLM) creates a portable execution layer.
- **Dependency Injection for Selectors**: Passing selectors as dependencies to actions (rather than importing them directly) allows for easier mocking and decoupling from the global selector engine.
- **Argument Order Consistency**: When refactoring to a `(ctx, deps, ...args)` pattern, it is crucial to maintain a consistent argument order across all actions to avoid confusing type errors during delegation.
