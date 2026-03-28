# Modular Action Architecture

This directory contains stateless, portable UI actions for the RSRCH agent. By separating UI interaction logic from the monolithic client classes, we improve testability and allow for easier dependency injection.

## Core Concepts

### UniversalContext

Defined in `src/actions/types.ts`, the `UniversalContext` provides the minimal environmental dependencies required for an action:
- `page`: Playwright `Page` instance.
- `log`: A standardized logging function.
- `db`: (Optional) `GraphStore` for state persistence.

### Action Dependencies (`deps`)

Each action receives a `deps` object containing external utilities or configurations it needs. Common dependencies include:
- `selectors`: UI selectors (usually passed from `src/selectors.ts`).
- `humanDelay`: Randomized delay function for anti-detection.
- `telemetry`: Unified telemetry for event tracking.

## Adding a New Action

1.  **Define the Action**: Create a new file in `src/actions/<agent>/<action-name>.ts`.
2.  **Export the Function**:
    ```typescript
    export async function myNewAction(
        ctx: UniversalContext,
        deps: { selectors: any; humanDelay: (ms: number) => Promise<void> },
        ...args: any[]
    ): Promise<T> {
        // Implementation
    }
    ```
3.  **Update the Barrel File**: Export the new action from `src/actions/index.ts`.
4.  **Delegate from Client**: Update the corresponding client (e.g., `GeminiClient`) to call the new action.

## Benefits

-   **Testability**: Actions can be tested in isolation using mocks for `Page` and `deps`.
-   **Portability**: Logic is decoupled from the `Windmill` or `Nomad` environment.
-   **Consistency**: Standardizes how UI interactions are performed across different agents.
