# Shared Agent Libraries

Common utilities and shared types for Antigravity agents.

## Contents

- **`nomad-jobs.ts`**: Types and helpers for interacting with Nomad jobs (Windmill, etc).
- **`service-discovery.ts`**: Service discovery helpers (Consul integration).
- **`tab-pool.ts`**: Management of browser tabs for multitasking.
- **`human-lock.ts`**: Coordination primitives for exclusive human interaction (preventing race conditions on user input).
- **`warmup.ts`**: Utilities for warming up caches or connections.

## Usage

```typescript
import { HumanLock } from '@agents/shared/human-lock';

const lock = new HumanLock();
await lock.acquire();
// ... exclusive interaction ...
lock.release();
```
