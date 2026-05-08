# Lessons Learned: Gemini Rsrch Agent Hardening

## 1. Modular Action Architecture
- **Stateless Actions**: Moving logic from a bloated `GeminiClient` to small, stateless functions in `src/actions/gemini/` makes the codebase much easier to maintain and test.
- **Dependency Injection**: Passing a `GeminiActionDeps` object to these actions allows them to remain decoupled from the client instance while still accessing necessary shared state (like selectors and tab pool).

## 2. Selector Management
- **Centralized YAML**: Keeping all selectors in `selectors.yaml` is a huge win for resilience. When Google changes their UI, we only need to update one YAML file.
- **Type Safety**: It is critical to keep the `src/selectors.ts` interface in sync with the YAML. A missing field in the interface leads to confusing compilation errors.

## 3. UI Parity Strategies
- **Mimicking Human Behavior**: To ensure reliability, actions should mirror manual navigation (e.g., hovering to reveal "More" menus before clicking).
- **Progress Tracking**: For long-running server-side tasks (like NotebookLM audio generation), polling the UI for specific text or progress bars is a reliable way to provide feedback to the CLI user.

## 4. Build and Verification
- **Incremental Commits**: Committing after each major feature implementation makes it easier to track progress and revert if something breaks.
- **Verification Loop**: Always run a full build (`tsc`) and verify `--help` commands to catch syntax errors or missing dependencies early.
