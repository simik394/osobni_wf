# Proposal 002: FalkorDB Implementation Plan - Infrastructure & Resource State

**Status**: Proposed
**Date**: 2025-12-27
**Target System**: `falkor-client` (@agents/shared)

## Context
Agents currently rely on environment variables (`BROWSER_CDP_ENDPOINT`) or hardcoded assumptions about where services (FalkorDB, Browser) are running. This leads to fragility when ports change or services move (e.g., Nomad dynamic ports).

## Proposed Schema

The database itself should serve as the service registry and resource locker for the agent ecosystem.

```cypher
(:Service {
    name: "angrav-browser",
    type: "chromium",
    endpoint: "http://localhost:9223",
    status: "healthy",
    lastCheck: timestamp
})

(:Resource {
    type: "BrowserProfile",
    path: "/home/sim/.config/google-chrome/Profile 1",
    in_use: true,            // Changed from isLocked to match spec
    locked_by: "session-uuid"
})
```

### Relationships

- **(Session)-[:USES_RESOURCE]->(Resource)**: Prevents concurrent access to exclusively locked resources (like browser user data dirs).
- **(Service)-[:HOSTS]->(Resource)**: Maps which service instance is managing which resource.

## Usage Scenarios

1.  **Dynamic Discovery**: Instead of `process.env.CDP_ENDPOINT`, `angrav` connects to FalkorDB and queries:
    ```cypher
    MATCH (s:Service {name: 'angrav-browser', status: 'healthy'}) RETURN s.endpoint LIMIT 1
    ```
    
2.  **Resource Locking**: Before starting a browser session, the agent attempts to lock the profile:
    ```typescript
    // Atomic lock in Redis/FalkorDB
    const locked = await client.lockResource('profile-1', sessionId);
    if (!locked) throw new Error("Profile in use by another agent");
    ```

## Implementation Steps

1.  Create `ServiceRegistry` class in `@agents/shared`.
2.  Add startup scripts for containers to register themselves in FalkorDB with a TTL.
3.  Implement `acquireLock(resourceId, sessionId)` in `FalkorClient`.
