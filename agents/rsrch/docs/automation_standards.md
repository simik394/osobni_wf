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
# Axioms of Agentic SDK Orchestration

This document codifies the "Universal Axioms" required for robust orchestration of Jules sessions and Agentic SDK bridges. These lessons were learned through iterative failure analysis of cross-environment signaling.

## 1. The MCP Schema Paradox
**Axiom**: Never assume an MCP tool has feature parity with the raw service API.
- **Problem**: `create_session` MCP tool omits the `startingBranch` parameter, leading to default `main` clones.
- **Enforcement**: Future orchestrators MUST explicitly check for a `git checkout` step as the first action if the target branch is not `main`.

## 2. Remote Sandbox Isolation (The Bridge Wall)
**Axiom**: File-based signaling is environment-local.
- **Problem**: A local dispatcher cannot see files written by a remote Jules (jules.google.com).
- **Enforcement**: For remote sessions, the bridge MUST be supplemented by a "Human-in-the-Loop" or "Chat-to-Signal" translator. The agent should `cat` its request files to the chat for the orchestrator to fulfill.

## 3. Git-State Anxiety (The Diff Stall)
**Axiom**: Large branch diffs trigger agent-wide security/context reviews.
- **Problem**: Switching from `main` to a feature branch with heavy SDK additions causes Jules to spend excessive credit/time analyzing diffs before execution.
- **Enforcement**: Pre-emptively instruct the agent to "Ignore git history, focus on the current directory state."

## 4. Bootstrapping Precedence
**Axiom**: Environment logic must be explicitly loaded.
- **Problem**: Agents assume standard shell binaries but miss custom SDKs.
- **Enforcement**: Mandatory `source agents/sdk/bootstrap.sh` in the initial session prompt.

## 5. Metadata Sync
**Axiom**: Configuration for agents belongs in `.jules/`.
- **Enforcement**: Keep all agent-specific capabilities and instructions in the project root's `.jules/` directory to ensure immediate discovery.
