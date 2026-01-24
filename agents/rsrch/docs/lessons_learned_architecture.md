# Lessons Learned: Architectural Discovery

## Incident: Windmill vs. CDP Architecture (2026-01-24)

### Context
I spent significant time debugging and "fixing" local CDP/VNC connections for the `rsrch` agent, assuming the server was meant to drive the browser directly. The user later pointed out that this was a "wrong assumption" and that Windmill was the intended solution.

### Root Cause
- I relied on the **current state of the code** (legacy `GeminiClient` with direct CDP calls) as the source of truth for the architecture.
- I missed the **Strategic Plan** (`agents/rsrch/docs/STRATEGIC_PLAN.md`) which explicitly stated the goal of moving to "Windmill flows that compose research operations" and "Complete Windmill integration".
- I focused on `architecture_matrix.md` which described the *mechanics* of connectivity (CDP + Socat) but not the *execution model* (Server driving CDP vs. Windmill driving CDP).

### Lessons
1.  **Read Strategic Docs First:** Before starting major refactoring or fixes, check `docs/STRATEGIC_PLAN.md` or similar high-level documents. They often contradict the current (legacy) code implementation.
2.  **Code != Architecture:** Existing code often represents "technical debt" or "past decisions," not necessarily the future direction.
3.  **Search for "Windmill" or "Orchestrator":** If a project mentions an orchestrator (like Windmill), assume it's meant to handle the heavy lifting (like browser automation), rather than just being a trigger for the server.

### Action Items
- When starting in a new codebase, run `find . -name "*PLAN.md"` or `find . -name "*ARCHITECTURE.md"`.
- Verify if "current implementation" matches "strategic goals" before optimizing the current implementation.
