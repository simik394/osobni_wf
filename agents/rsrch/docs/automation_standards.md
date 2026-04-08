# Automation & Docker Building Standards

> [!IMPORTANT]
> These rules are MANDATORY to prevent cache invalidation disasters and unnecessary rebuilds.

## Docker Image Building Rules

1. **NEVER edit an existing `RUN` instruction if downstream layers are expensive.** Add a **NEW** `RUN` layer below it instead. Docker caches layer-by-layer; changing any instruction invalidates it AND everything after it.
2. **Order layers by volatility.** Most stable, slowest-to-build layers FIRST (base OS, heavy frameworks like Wine). Frequently-changing layers LAST (app code, config files, small patches).
3. **Separate base dependencies from extra dependencies.** Heavy base installs (e.g., WineHQ ~1GB) belong in their own early, rarely-touched layer.
4. **Pre-edit impact check.** Before ANY Dockerfile edit, ask: "Will this invalidate a layer that takes >60s to rebuild?" If yes, find an alternative.
5. **Use build-args for variable values.** For UID/GID or similar, use `ARG` to avoid invalidating the whole build.
6. **COPY/ADD instructions as late as possible.**
7. **Verify before long builds.** Inspect what will be rebuilt.

## Build Instance Selection (Total Cost Analysis)

Before building, decide between **Local** and **Remote (halvarm)** based on:
- **C1: Download Speed** (halvarm is 4.7x faster)
- **C2: CPU Power** (Local has 5.5x more cores)
- **C3: Transfer Cost** (Image transfer over network if remote build)
- **C4: Architecture Mismatch** (halvarm is ARM — avoid for x86 apps unless multi-arch is needed)
- **C5: Disk Space** (halvarm has limited 9GB free)
- **C6: Runtime Requirements** (GUI apps MUST typically build/run locally)

**Decision Tree:** If it's a **GUI app with X11 passthrough** (like reMarkable desktop), **BUILD LOCALLY**.
