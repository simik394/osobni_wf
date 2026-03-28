# Lessons Learned - rsrch Project

This is a living record of technical challenges, architectural discoveries, and critical fixes. **Always consult this document at the start of a task.**

---

## 🏗️ Quick Reference (Summarized)

### 🔐 Authentication & Profiles
- **Auth Strategy:** Use VNC to log in directly to the target production browser container. Persistent context maintains the session without fragile file transfers.
- **Local CDP:** Set `USE_WINDMILL=false` and `BROWSER_CDP_ENDPOINT=http://localhost:9225` for rapid local iteration.

### 🏗️ Architecture & Execution
- **Code != Architecture:** Always check `STRATEGIC_PLAN.md` before refactoring. Existing code often represents technical debt, not the intended future direction.
- **The Singleton Image:** API, VNC, and Chromium should share the same PID namespace and filesystem to eliminate network dependency issues.
- **Self-Healing Startup:** Entrypoint scripts MUST explicitly `rm -f` `SingletonLock` and `LOCK` files before starting the browser.
- **Docker CDP:** Use `--remote-allow-origins=*` and internal Docker DNS for container talk. Rewrite `webSocketDebuggerUrl` if necessary.

---

## 📜 Historical Detailed Logs (Verbatim)

### [[1. Architectural Discovery (2026-01-24) - Windmill vs. CDP]](file:///home/sim/Obsi/Prods/01-pwf/agents/rsrch/docs/.archive/lessons_learned_architecture.md)

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

---

### [[2. NotebookLM Interfacing Detail]](file:///home/sim/Obsi/Prods/01-pwf/agents/rsrch/docs/.archive/lessons_learned_notebooklm.md)

# NotebookLM Interfacing Lessons Learned

## Modal UI Instability
- **Root Cause**: NotebookLM (and many Angular/SPA apps) maintains multiple `<add-sources-dialog>` elements or `<mat-dialog-container>` in the DOM from previous UI states. 
- **Effect**: Blind Playwright locators (e.g., `.first()`) may lock onto an older, invisible dialog instance that is hidden by the current active backdrop (`cdk-overlay-backdrop`). Calling `click()` on elements within that stale wrapper freezes Playwright because the overlay indefinitely blocks pointer events.
- **Solution**: Avoid generic click fallbacks with `{ force: true }` because forcing the click disables the browser's native 'trusted event', which is required to invoke the `filechooser`. To combat DOM pollution, isolate the entire browser context sequence (run uploads one-by-one with isolated Node sessions) rather than keeping an SPAs state alive indefinitely across loops.

## Batch Upload Isolation
- **Problem**: When passing 9 PDFs through `waitForEvent('filechooser')` inside a large `for` loop, the script frequently hung. NotebookLM's uploader state occasionally stalls out or changes intermediate selectors.
- **Solution**: A sequential Bash script `for f in ...; do rsrch notebook add-local-source "$f"; done` provides a much higher rate of success. Each file upload utilizes a fresh connection to the remote CDP browser, which clears any lingering dialog overlays and UI bugs between runs. It completely mitigates memory leaks and SPA component desync.

## HTML Scraping & Text Conversion
- **Problem**: Many LMS platforms (like Moodle) store their primary instructional content in `mod/page` or `mod/book` modules rather than just PDF files. Simply downloading attachments missed 70% of the course content.
- **Solution**: A tailored scraper using `jsdom` or Playwright can extract the `innerHTML` of the `#region-main` or `[role="main"]` area.
- **Optimization**: Converting extracted HTML to plain `.txt` (stripping tags) before uploading to NotebookLM is crucial. This reduces token waste, eliminates noise from navigation/sidebar elements, and improves the quality of the AI's grounding by providing clean, content-focused data.
- **Deduplication**: Use `rsrch notebook sources <title>` to audit the current state before batching, as re-running scripts can easily lead to source duplication in the UI.

---

### [[3. Browser Singleton Recovery Autopsy (2026-01-24)]](file:///home/sim/Obsi/Prods/01-pwf/agents/rsrch/docs/.archive/2026-01-24_singleton_recovery_autopsy.md)

# Technical Autopsy: Browser Singleton Recovery (2026-01-24)

## Executive Summary
The Browser Singleton (API + VNC + Chromium in one container) was broken and crash-looping. The recovery process revealed several layers of architectural fragility, culminating in a stable, optimized "Turbo" deployment strategy and a unified execution environment.

## 1. The "Silent Hang" Mystery
### **Experience**
The container would start, log "Launching persistent context", and then... nothing. No error, no crash, just a silent wait.
### **Mismatch / Misunderstanding**
We assumed the environment (system libraries, X11) was the issue.
### **Actual Cause**
**Playwright Version Mismatch.**
- **Local Machine**: Playwright `v1.58.0` (compiled code expects binaries at `/ms-playwright/chromium-1208`).
- **Container**: `mcr.microsoft.com/playwright:v1.57.0-jammy` (libraries at `/ms-playwright/chromium-1200`).
- **Result**: Playwright's Node.js wrapper looked for a binary that didn't exist. Instead of throwing a clean "File Not Found", it hung or failed silently until we enabled `DEBUG=pw:api`.

## 2. The `package.json` Fragility
### **Experience**
Even after fixing the version, the server failed with `Cannot find module '../package.json'`.
### **Failure**
We tried to fix it by traversing the directory tree (`while (currentDir !== root)...`), but the nested `dist/rsrch/src/` structure combined with Docker's limited volume/context mapping made relative lookups unreliable.
### **Resolution**
Harden metadata lookups. **Hardcode versions or create local metadata failsafes** during the build step. Never rely on `../package.json` traversals in compiled containerized code.

## 3. The "Stale Lock" Blockade
### **Experience**
Manual restarts of the container often resulted in the browser failing to launch.
### **Actual Cause**
**Stale `SingletonLock` files.**
- Chromium's persistent profile directory on the host (`/opt/rsrch/profiles/...`) retained lock files from previous crashed instances.
- New container instances saw these locks and refused to start.
### **Fix**
Implemented a "Self-Healing" startup script (`start-vnc.sh`) that explicitly purges `SingletonLock` and `LOCK` files before calling the main application.

## 4. The "Turbo" Dev Loop Revolution
### **Misunderstanding**
We initially tried to "Build Remote" (running `tsc` inside the container) to ensure matching environments.
### **Failure**
Remote builds were slow (> 5 minutes), prone to RAM exhaustion on `halvarm`, and hard to debug.
### **The New Standard: "Build Local, Deploy Dist"**
1.  **Local Compilaton**: Run `npm run build` locally (takes seconds).
2.  **Rsync Sync**: Propagate only the `dist/` folders and `package.json` to the remote build context.
3.  **Lean Dockerfile**: The unified image now just copies binaries and package metadata. No compilation occurs in the container.
4.  **Result**: **~45 second total deployment time.**

## 5. Architectural Shift: The Singleton
Moving away from sidecars:
- **OLD**: API Container + Chromium Sidecar (network dependency issues).
- **NEW**: **The Singleton Image.** API, VNC, and Chromium share the same PID namespace and filesystem. This eliminates "Host unreachable" errors and simplified Windmill orchestration (Port 9223 is ALWAYS there if the API is there).

---
**Status**: 🟢 RESTORED & STABLE
**Lessons Anchored in**: `LESSONS_LEARNED.md`

---

### [[4. Docker CDP Connection Fix (2026-01-11)]](file:///home/sim/Obsi/Prods/01-pwf/agents/rsrch/docs/.archive/lessons-learned-docker-cdp-fix.md)

# Lessons Learned: Docker CDP Connection Fix

**Date**: 2026-01-11  
**Issue**: rsrch Docker container could not connect to Chrome browser for Gemini queries

## Problem Summary

The `perplexity-server` Docker container was unable to connect to the `rsrch-chromium` container via Chrome DevTools Protocol (CDP), resulting in "Context not initialized" errors when attempting Gemini research queries.

## Root Causes

### 1. Host Header Validation
Chrome's CDP endpoint rejects connections with non-localhost Host headers by default. When connecting via Docker networking (e.g., `host.docker.internal:9223`), Chrome's security check fails.

**Solution**: Added `--remote-allow-origins=*` flag to Chrome arguments in `browser/server.js`.

### 2. Port Mapping Confusion
The initial configuration used `host.docker.internal:9225` which required traffic to exit the Docker network, re-enter via port mapping, and then reach the container. This added unnecessary complexity and latency.

**Solution**: Changed `BROWSER_CDP_ENDPOINT` to use Docker internal DNS: `http://chromium:9223` - containers communicate directly on the internal network.

### 3. Host Header Rewriting
Even with `--remote-allow-origins=*`, the Chrome CDP endpoint returns `webSocketDebuggerUrl` endpoints using `localhost`, which breaks when the connecting client (perplexity-server) is in a different container.

**Solution**: Replaced the simple `socat` TCP proxy with a Node.js HTTP/WebSocket proxy that:
- Rewrites the `Host` header to `localhost` before forwarding to Chrome
- Rewrites `webSocketDebuggerUrl` in CDP JSON responses to use Docker service names

### 4. FalkorDB Connection Default
The FalkorDB connection defaults to `localhost` if `FALKORDB_HOST` is not set. Inside Docker, `localhost` resolves to the container itself, not the FalkorDB service.

**Solution**: Added `FALKORDB_HOST=falkordb` environment variable and `depends_on` for proper startup ordering.

## Key Files Modified

1. **`docker-compose.yml`**
   - `BROWSER_CDP_ENDPOINT=http://chromium:9223`
   - `FALKORDB_HOST=falkordb`
   - Added `depends_on: [chromium, falkordb]`

2. **`browser/server.js`**
   - Added `--remote-allow-origins=*` to Chrome flags
   - Replaced socat with Node.js HTTP/WS proxy
   - URL rewriting for `webSocketDebuggerUrl`

3. **`src/server.ts`**
   - Added lazy browser initialization in `/gemini/research` endpoint

## Verification Commands

```bash
# Check all containers are running
docker compose ps

# Verify health endpoint shows all dependencies OK
curl -s http://localhost:3001/health | jq .

# Test Gemini research
curl -X POST http://localhost:3001/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"gemini-rsrch","messages":[{"role":"user","content":"What is 2+2?"}]}'
```

## Takeaways

1. **Use Docker internal DNS for container-to-container communication** - Avoid `host.docker.internal` when both services are in the same Docker network.

2. **Chrome CDP requires special handling for non-localhost connections** - The `--remote-allow-origins=*` flag is essential.

3. **URL rewriting may be necessary** - CDP responses contain hardcoded hostnames that need to be rewritten for cross-container compatibility.

4. **Always set explicit host environment variables** - Don't rely on defaults that assume localhost when running in Docker.


---

### [[5. Modular Refactor & Folder Reorganization (2026-03-28)]](file:///home/sim/Obsi/Prods/01-pwf/agents/rsrch/docs/.archive/2026-03-28_modular_refactor_cleanup.md)

# Lessons Learned: Modular Refactor & Cleanup

## 🏗️ Architectural Transition
- **Decoupled Action Pattern:** Transitioning from monolithic client methods (e.g., `GeminiClient.uploadFiles`) to stateless actions in `src/actions/` using `UniversalContext` and standardized `Deps` improves portability and testability.
- **Statelessness is Key:** Actions should not maintain internal state; they should receive everything they need (page, logger, selectors, timing helpers) via dependency injection.

## 🛠️ Refactoring Challenges
- **Relative Import Cascades:** Large-scale reorganization (e.g., merging core logic into `src/core/` and `src/services/`) triggers massive import breaks. Surgical, file-by-file correction is safer than bulk regex when dealing with deep directory nesting (`../` vs `../../`).
- **Interface Bloat vs. Utility:** Standardizing `ActionDeps` is helpful, but making all fields mandatory can lead to "dummy" dependencies in simple actions. Use optional fields or `Partial<T>` to keep action calls clean.
- **Tooling Precautions:** Global `sed` replacements for dependency injection (e.g., injecting `humanDelay` into all `{ selectors }` blocks) can accidentally corrupt `import` statements. Always scope regex to block patterns or use AST-aware tools if possible.

## ✅ Verification
- **TSC as Truth:** A final `npx tsc -p tsconfig.json --noEmit` is the ONLY way to guarantee that a 3,000+ line refactor hasn't left "silent" import or type errors in rarely used modules.

---
---

### [[4. Gemini Rich Content Parsing (2026-03-28)]](file:///home/sim/Obsi/Prods/01-pwf/agents/rsrch/docs/.archive/2026-03-28_gemini_parsing_autopsy.md)

# Lessons Learned: Gemini Rich Content Parsing

## High-Fidelity DOM Extraction
- **Problem**: Standard `innerText()` is destructive for structured AI output. It flattens LaTeX ($ / $$), strips URLs from indexed citations ([1], [2]), and mangles code block whitespace.
- **Solution**: **DOM Cloning + Selective Transformation.** By cloning the message element in `page.evaluate`, we can replace fragile UI components (like `mjx-container` for math or attribution links) with stable Markdown equivalents *before* calling `innerText`. This preserves the AI's intended formatting while capturing underlying metadata.
- **LaTeX Detection**: Gemini uses MathJax (`mjx-container`). Extracting the `tex` attribute directly from these elements is far more reliable than regex-parsing the resulting plain text.

## From Chat History to Research Graph
- **Architecture**: AI responses should not be stored as simple strings. Mapping them to `Session -> Turn -> Citation` nodes in FalkorDB enables "Source Provenance".
- **Consistency**: Centralizing extraction in `GeminiClient.getLatestResponseData()` ensures that both the CLI, Windmill flows, and future agents benefit from the same high-fidelity parsing logic.
