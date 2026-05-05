# Lessons Learned: Rsrch Architecture Stabilization

## Technical Insights
1. **Vitest Mock Hoisting**: When mocking modules like `falkordb`, ensure that all mock objects are defined *inside* the `vi.mock` factory function if they are used to define the mock's return values. Hoisting can cause variables defined in the test file to be `undefined` when the factory is executed at the top level.
2. **Modular Connection Lifecycles**: Moving connection logic (like circuit breakers and retries) into a dedicated `GraphConnection` class requires updating all test mocks to simulate the internal state transitions (e.g., `initSchema` calls during `connect`).
3. **Promise-based Server Start**: In Express, always ensure the `startServer` function calls `resolve(server)` inside the `app.listen` callback. Failing to do so will cause any await on `startServer` to hang indefinitely, leading to test timeouts.
4. **Validation Parity**: API validation (like checking for empty message content) should be consistent across all endpoints to avoid 500 errors being returned for 400-level client mistakes.

## Process Improvements
- **Test-Driven Refactoring**: Using the existing test suite as a guardrail during architecture decomposition is essential. Fixing tests *immediately* after a refactor prevents technical debt from snowballing.
- **Mock Standardization**: Aligning different test files to use the same mock patterns (e.g., `retry.test.ts` and `graph-store.facade.test.ts`) reduces maintenance overhead and increases confidence in test results.

## CLI & Action Refactoring (2026-05-05)
1. **Interface Drift**: When splitting large modules, property names (e.g., `docUrl` vs `googleDocUrl`) can easily diverge between the CLI layer, the client bridge, and the server router. Standardizing these naming conventions upfront in a central type definition is critical.
2. **Action Composition**: Implementing complex browser flows (like `chatWithGem`) by composing simpler atomic actions (`openGem` + `sendMessage`) significantly reduces code duplication and improves maintenance.
3. **Implicit vs Explicit Returns**: TypeScript errors in CLI command handlers (TS1345) often stem from "truthiness" checks on functions returning `Promise<void>` or mismatched `Promise<any>` signatures. Explicit return types for every Playwright action are mandatory for stable builds.
4. **Facade Efficiency**: Adding specialized query methods (like `getConversationState`) to the data storage facade (`GraphStore`) avoids the expensive overhead of retrieving and filtering large datasets in the consumer layer.
