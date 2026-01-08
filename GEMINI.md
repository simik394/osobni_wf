test
# Agent Protocols

- **Lessons Learned**: ALWAYS search for and consult [LESSONS_LEARNED.md](file:///home/sim/Obsi/Prods/01-pwf/LESSONS_LEARNED.md) at the start of a task. After completing a significant feature or solving a complex bug, update this file with new insights. Categorize entries under Technical, Process, or Agentic headers.

## User Mandates
- When making changes, always ensure content is backed up first or added to the destination before removing it from the source to prevent data loss.
- **Docker > Local Installation**: Prefer running tools via Docker containers over installing packages locally (pip, npm, etc.). This keeps the system clean and dependencies isolated.
- **Scripts over Ad-hoc Fixes**: For repeatable tasks (like file renaming, postprocessing), always create a reusable script rather than doing one-time manual fixes. This ensures the solution is persistent and can be integrated into automation pipelines.

## ⚠️ CRITICAL: Non-Blocking Audio Generation Architecture

> [!CAUTION]
> **THIS ARCHITECTURE IS MANDATORY. DO NOT DEVIATE WITHOUT EXPLICIT USER REQUEST.**
> 
> NotebookLM supports parallel audio generation. NEVER wait for one generation to complete before starting another.

### Required Architecture:
1. **Click Script** (Windmill) → Start generation → Set up watcher → **RETURN IMMEDIATELY**
2. **Watcher** → Monitor page in background → Call webhook on completion
3. **Webhook** → Update FalkorDB → Send ntfy notification
4. **Queue** → Next click job runs in parallel

### Forbidden Patterns:
- ❌ `await waitForGeneration()` - NEVER block waiting for audio to complete
- ❌ `while (isGenerating) { sleep() }` - NEVER poll in a blocking loop
- ❌ Assuming only one generation can run at a time

### Required Behaviors:
- ✅ Trigger generation and return immediately
- ✅ Use existing browser tab if already on correct notebook
- ✅ Queue multiple generations - they run in parallel on cloud
- ✅ Notifications via webhook/watcher, not by blocking