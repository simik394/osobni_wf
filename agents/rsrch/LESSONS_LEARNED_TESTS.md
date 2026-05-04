# Lessons Learned: Test Suite Restoration & Smoke Testing

1. **Modular Refactors and Test Fragility**: When refactoring a monolith into modular services, the test suite is often the first thing to break due to "Path Drift". Relative imports (e.g., `../src/client`) become stale. Using absolute paths or package-level aliases (if configured) can mitigate this.
2. **Strictness vs. Resilience in Selectors**: Changing a configuration loader (like `selectors.ts`) from "soft-fallback to defaults" to "hard-fail on missing file" is a breaking change for existing tests. Mocks must be updated to either provide the file or handle the exception.
3. **Smoke Tests as Connectivity Gates**: A production smoke test is invaluable for identifying "Zombies" — services that report `running` in Nomad but are `not_initialized` internally (e.g., disconnected browser).
4. **Mock Completeness**: When a class method like `dumpState` depends on browser methods like `page.content()`, the mock must implement them even if they aren't the focus of the test, otherwise the entire test suite fails with cryptic `TypeError`s.
5. **Nomad Connectivity**: In production, the "Mode: Local Execution" flag might be misleading if it means it hasn't established its remote CDP connection yet. The `/health` endpoint is the source of truth.
