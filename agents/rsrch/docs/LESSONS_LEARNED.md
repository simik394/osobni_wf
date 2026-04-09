# Lessons Learned - rsrch Project

This is a living record of technical challenges, architectural discoveries, and critical fixes. **Always consult this document at the start of a task.**

---

## 🏗️ Quick Reference (Summarized)

### 🔐 Authentication & Profiles
- **Auth Strategy**: Use VNC to log in directly to the production browser container. Persistent context maintains the session without fragile file transfers.
- **Local CDP**: Set `USE_WINDMILL=false` and `BROWSER_CDP_ENDPOINT=http://localhost:9222` (or 9225) for rapid local iteration.

### 🏗️ Architecture & Execution
- **Singleton Mandate**: API, VNC, and Chromium MUST share the same container to eliminate networking overhead and container desync. 
- **TabPool Compliance**: Use `BrowserClient.getTabPage()` to lease shared tabs. Never use `page.goto()` for top-level navigation in shared contexts; use `client.recycle()` instead.
- **Modular Actions**: Logic MUST be stateless functions in `src/actions/`. Clients are thin wrappers for orchestration.
- **UniversalContext**: Always use `ctx.log` and `ctx.config` instead of `console.log` or direct imports.
- **Surgical Cleanup**: Frequent `npm run build` is mandatory to catch broken imports after deep refactoring.

---

## 🎯 Core Architectural Patterns

### [[7. Modular Action Pattern (2026-04-02)]](file:///home/sim/Obsi/Prods/01-pwf/agents/rsrch/docs/DEVELOPMENT.md#2-browser-action-pattern-stateless-handlers)
- **Problem**: Monolithic clients became "God Objects" that were fragile and hard to test.
- **Solution**: Decouple UI logic into stateless `Action` modules in `src/actions/`. Clients become thin orchestrators.
- **Benefit**: Achieved high reusability (e.g., `listSessionsAction` used independently). 21/21 Gemini tests pass.

### [[15. Browser Efficiency & Resource Management]](file:///home/sim/Obsi/Prods/01-pwf/agents/rsrch/docs/DEVELOPMENT.md#10-browser-efficiency--resource-management)
- **Lease & Release**: Use `BrowserClient.getTabPage()` and call `release()` in a `finally` block to prevent leaks.
- **UI-Based Recycling**: Prefer clicking home icons/logos over `page.goto()` to preserve cache and session stability. This is the primary way to clear state between runs in a singleton container.
- **CDP Handshake**: Swapping `ws://` to `http://` is mandatory for `/json/version` discovery when connecting over CDP.
- **Singleton Observability**: Use `ctx.log` for all action logging. Prefixing and verbosity are controlled by the client wrapper, ensuring logs work across CLI and Windmill.

### [[17. Systematic Refactoring & Type Safety]](file:///home/sim/Obsi/Prods/01-pwf/agents/rsrch/lessons_learned.md)
- **Monolith Decomposition**: Breaking large orchestrators into specialized routers/actions improves testability.
- **Externalized Selectors**: Moving selectors to `selectors.yaml` decoupled logic from UI changes.
- **TSC as Truth**: Frequent `npm run build` catches broken imports and type mismatches across deep directory structures.

---

## 📜 Historical Detailed Logs (Verbatim)

### [[16. Remote Audio Downloads (NotebookLM)]](file:///home/sim/Obsi/Prods/01-pwf/agents/rsrch/docs/lessons_learned_audio_download.md)

- **Remote CDP Boundary**: Standard `download.saveAs()` fails in remote sessions because it tries to copy from the server's `/tmp` to the client's filesystem. 
- **The "Golden Path"**: Use `context.request.get(url)` to fetch the audio binary. This bypasses CORS (using browser cookies) and brings the payload directly into the local script's memory.
- **Raw JS Interactors**: In SPAs with complex CDK overlays (like NotebookLM), use `page.evaluate()` with raw JS strings to trigger clicks on menu items, as it bypasses Playwright's "visibility" checks that often get stuck on backdrops.
- **Impersonation Fallback**: If standard methods fail, use `curl` with extracted cookies (`context.cookies()`) immediately after capturing the download URL.

---

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

### [[6. Gemini Rich Content Parsing (2026-03-28)]](file:///home/sim/Obsi/Prods/01-pwf/agents/rsrch/docs/.archive/2026-03-28_gemini_parsing_autopsy.md)

# Lessons Learned: Gemini Rich Content Parsing

## High-Fidelity DOM Extraction
- **Problem**: Standard `innerText()` is destructive for structured AI output. It flattens LaTeX ($ / $$), strips URLs from indexed citations ([1], [2]), and mangles code block whitespace.
- **Solution**: **DOM Cloning + Selective Transformation.** By cloning the message element in `page.evaluate`, we can replace fragile UI components (like `mjx-container` for math or attribution links) with stable Markdown equivalents *before* calling `innerText`. This preserves the AI's intended formatting while capturing underlying metadata.
- **LaTeX Detection**: Gemini uses MathJax (`mjx-container`). Extracting the `tex` attribute directly from these elements is far more reliable than regex-parsing the resulting plain text.
- **Defensive Heuristics**: Instead of relying on specific internal attributes like `data-attribution-url` (which Gemini often changes), use broad tag selectors (`table`, `a`, `mjx-`) combined with text-length and URL-subsequence matching to identify citations and tables.

- **Implementation: Submit & Return Architecture**: We've transitioned to a decoupled **Submit** (heavy worker) and **Watch** (lightweight worker) pattern. This immediately releases the primary Windmill worker after prompt delivery, delegating monitoring to a secondary "Watcher" agent that connects to the existing CDP tab.
- **Async State Hygiene**: Implementing a `PENDING` state in FalkorDB *before* the watcher completes ensures that sessions are trackable even if a generation fails or the watcher job is interrupted. This provides a clear audit trail for long-running research tasks.
- **Remote CDP Reliability**: Remote browsers (on `halvarm:9223`) can be transient. Automation scripts MUST handle `Target closed` errors gracefully and provide detailed `dumpState` diagnostics for headless debugging.

---

### [[8. Hybrid Interactive Dashboard & TS Regressions (2026-04-02)]]

- **Hybrid Quarto + OJS Coordination**: Building an interactive dashboard with Quarto + Observable JS (OJS) requires a live backend API. Since OJS runs client-side in the browser, the backend server MUST have `cors()` enabled and the OJS `fetch/d3.json` calls must target the correct local port (e.g., `localhost:3030`).
- **Codebase Synthesis for Dashboards**: Implementing a `DashboardService` that scans filesystem patterns (e.g., `src/actions/` vs `src/clients/`) is an effective way to provide real-time "Architectural Health" metrics without manual status updates.
- **TS Downlevel Iteration (Set Spread)**: The spread operator `[...new Set(urls)]` can fail with `TS2802` in environments targeting ES5/ES6 without the `--downlevelIteration` flag. **Standardize on `Array.from(new Set(urls))`** for maximum compatibility when converting Sets to Arrays in core library code.
- **Bridge Method Preservation**: When refactoring monolithic clients into modular actions, keep "bridge methods" (simple wrappers) in the main client during the transition. This prevents regressions in existing routers and background workflows that still rely on the old client interface.

---

### [[9. Dashboard UX & OJS/Mermaid Gotchas (2026-04-02)]]

- **OJS String Highlighting**: Observable JS (OJS) in Quarto dashboards automatically "inspects" and syntax-highlights raw string values (adding quotes and color). To prevent this and enforce custom CSS, wrap OJS values in an HTML template: `html`<span class="my-class">${value}</span>``.
- **Mermaid Contrast in Dark Themes**: CSS `fill` overrides for Mermaid SVG text are fragile and often ignored by the Mermaid renderer's internal styles. A robust solution is to use a light-background container (`background: #ffffff !important`) for the Mermaid div, effectively creating a high-contrast "card" within a dark dashboard.
- **Valuebox Responsiveness**: Avoid hardcoding `font-size` in `valuebox-value` CSS. Quarto's dashboard engine handles font scaling based on row height; forcing font sizes causes text overflow and layout breakage on smaller viewports.

---

### [[10. AI Mode Integration & Google Service Disambiguation (2026-04-05)]]

- **Google Service Disambiguation**: Google AI Mode (Search SGE, `udm=50`) is fundamentally different from AI Studio (developer API). AI Mode is a conversational search interface integrated into Google Search, while AI Studio is a developer-facing API/IDE. Always treat them as separate platforms with separate selectors, actions, and storage types.
- **My Activity as Canonical History Source**: The sidebar in AI Mode (`button[aria-label*='AI Mode history']`) only shows recent activity. For comprehensive history sync, target `myactivity.google.com/myactivity?product=83` which provides all AI Mode queries with full URLs (including `mstk` session tokens).
- **Platform Type Extensibility Pattern**: When adding a new platform to `GraphStore.syncConversation`, the change is minimal — just widen the TypeScript union type (`'gemini' | 'perplexity' | 'aimode'`). The underlying Cypher queries use string interpolation and don't need changes. This confirms the graph schema is sufficiently generic.
- **Tab Pool Service Registration**: Adding a new browser-based service requires updating `SERVICE_URLS` in `agents/shared/src/tab-pool.ts` AND rebuilding the shared package (`cd agents/shared && npm run build`). Forgetting the shared rebuild is a common source of "type not assignable" errors at compile time.
- **Selector Type Registration**: The `NotebookLMSelectors` interface in `selectors.ts` is the TypeScript-level catalog of all selector groups. Adding a YAML section without a matching TS interface entry causes `Property 'X' does not exist` errors in all action modules that reference the new selectors.

---

### [[11. Robust Selector Design for Google/SPA Pages (2026-04-05)]]

- **NEVER use minified CSS class names** (e.g., `.Zkbeff`, `.rBl3me`, `.H23r4e`, `.NDNGvf`) as selectors for scraping. Google regenerates these with every frontend deployment. They will break within days/weeks.
- **Selector priority hierarchy** (most stable → least):
  1. **`data-*` semantic attributes**: `data-xid="aim-mars-turn-root"`, `data-streaming-container`. These are application-level identifiers, not styling artifacts.
  2. **`aria-label`** / **`role`** attributes: `div[role="dialog"]`, `button[aria-label*="Copy"]`. Stable because they're accessibility requirements.
  3. **Semantic HTML tags**: `pre`, `code`, `textarea`, `section`. These never change.
  4. **`jsname`** attributes: `div[jsname="coFSxe"]`. More stable than classes in Google's Lit/Angular framework, but can shift between major refactors.
  5. **`href` patterns**: `a[href*="udm=50"][href*="mstk="]`. URL structure changes rarely.
  6. **`placeholder` / `name` attributes**: `textarea[placeholder*="Ask"]`. Localized but predictable.
  7. **`id` attributes**: `#center_col`. Stable if present, but Google rarely uses them.
- **Always implement cascading fallback chains**: Primary selector → secondary fallback → tertiary → body text extraction. Log which level was used for debuggability.
- **i18n resilience**: Google localizes aria-labels. Always include at least EN + CS (user locale) fallbacks: `button[aria-label*="Copy" i], button[aria-label*="Kopír" i]`.
---

### [[12. Ansible community.docker & requests library incompatibility (2026-04-08)]]

- **Issue**: Running the `remarkable-wine` Docker build via Ansible's `community.docker.docker_image` module failed with the error: `Not supported URL scheme http+docker`. This was caused by an incompatibility between the recently updated `requests` library (2.32.0+) and the older transport handlers in the Docker SDK / Ansible collection.
- **Fix**: 
    1.  **Dependency Upgrade**: Upgraded `docker` Python SDK to `7.1.0` and `requests` to `2.33.1`.
    2.  **Collection Upgrade**: Upgraded `community.docker` collection to `5.1.0`.
    3.  **Resilient Strategy**: Switched the Ansible build task from the `docker_image` module to `ansible.builtin.shell` calling the `docker` CLI directly.
- **Lesson**: Library-level transport abstractions (like those in `community.docker`) are prone to breaking during minor updates of underlying dependencies (like `requests`). For basic operations like building an image from a local context, using the native CLI via `shell` is often more robust and less sensitive to fragmentation in the Python environment, especially in mature codebases with older Ansible versions.

---

### [[13. Docker Image Building — MANDATORY Rules (2026-04-08)]]

> **Context**: Editing an early `apt-get install` layer in a Dockerfile to add 3 small packages (`libvulkan1`, `dbus-x11`, `libasound2:i386`) caused a full cache invalidation of ALL downstream layers, triggering a 30+ minute rebuild that re-downloaded ~1GB of WineHQ packages over a slow connection. This was entirely avoidable.

#### RULES (Non-Negotiable):

1. **NEVER edit an existing `RUN` instruction if downstream layers are expensive.** Instead, add a NEW `RUN` layer below it for the new packages. Docker caches layer-by-layer; changing any instruction invalidates it AND everything after it.

2. **Order layers by volatility:** Put the most stable, slowest-to-build layers FIRST (base OS, large framework installs like Wine). Put frequently-changing layers LAST (app code, config files, small dependency patches).

3. **Separate "base dependencies" from "extra dependencies":** Structure Dockerfiles so that the core heavy install (e.g., WineHQ ~1GB) is in its own early, rarely-touched layer. Additional/optional packages go in a separate, later `RUN` block:
   ```dockerfile
   # LAYER 1: Heavy base (NEVER TOUCH after initial build)
   RUN apt-get install -y wine-stable ...
   
   # LAYER 2: Extra/optional deps (safe to modify)
   RUN apt-get update && apt-get install -y libvulkan1 dbus-x11 ...
   ```

4. **Before ANY Dockerfile edit, check:** "Will this invalidate a layer that takes >60s to rebuild?" If yes, find an alternative (new layer, multi-stage, build arg).

5. **Use `--cache-from` or named builder caches** for images that are rebuilt frequently, especially on slow networks.

6. **COPY/ADD instructions go as late as possible.** Files that change often (entrypoint scripts, configs) should be copied AFTER all package installs.

7. **For UID/GID changes:** If the user needs a different UID, use `--build-arg` so it doesn't invalidate the layer:
   ```dockerfile
   ARG HOST_UID=1000
   RUN useradd -m -u ${HOST_UID} -s /bin/bash appuser
   ```

8. **Test Dockerfile changes with `--dry-run` first** (or just `docker build` with `--no-cache` awareness) to understand which layers will be rebuilt before committing to a long build.

- **Cost of violation**: 30+ minutes of wasted rebuild time on a slow network, user frustration, and zero functional progress. This is unacceptable for a 3-package addition that should have taken <30 seconds as a new layer.

### [[14. reMarkable Desktop (Qt Installer Framework) & Wine/Xvfb Stability (2026-04-08)]]

> **Context**: Attempting to install the reMarkable desktop app via Wine in a headless Docker container failed multiple times due to incorrect assumptions about the installer and virtual display management.

#### LESSONS LEARNED:

1. **Qt Installer Framework (IFW) vs NSIS**: 
   - Most Windows installers use NSIS (flags like `/S` work). 
   - reMarkable uses **Qt Installer Framework**. It completely ignores `/S` and launches a GUI wizard that crashes headless containers.
   - Correct silent command: `install --accept-licenses --default-answer --confirm-command --root "C:\Path\To\Install"`.

2. **Wine/Xvfb IPC Stability**:
   - Wrapping every command in `xvfb-run -a` creates a *race condition*. `xvfb-run` kills the X server before `wineserver` is finished with IPC, leading to `fatal IO error 2` and corrupted Wine prefixes (missing `kernel32.dll`).
   - **BETTER PATTERN**: Start one persistent background `Xvfb` process for the entire installation phase, then shut it down cleanly only after `wineserver -w`.

3. **Disabling Mono/Gecko for Headless Init**:
   - `wineboot --init` often hangs or times out (5-minute hard-coded Wine timeout) downloading Mono/Gecko over slow networks.
   - For apps like reMarkable (C++ based), disable these during init with `export WINEDLLOVERRIDES="mscoree,mshtml="` to ensure a fast and predictable prefix creation.

4. **Atomic Init Check**:
   - Never rely on `[ -d drive_c ]` to check if a Wine prefix is ready. A failed/interrupted init leaves `drive_c` but no system DLLs. Use a "sentinel file" (e.g., `.initialized`) created only after successful setup.

- **Success Result**: Atomic, stable installation of reMarkable in ~2 minutes with zero IPC bridge crashes.

---

### [[18. Hardening Autonomous Screen Recording Services (2026-04-08)]]

> **Context**: Transforming a manual screenshot script into a robust systemd service (`screenshot-record.service`) with autonomous archival (CRF 42), privacy protection, and metadata reconciliation.

#### LESSONS LEARNED:

1. **Systemd "Zombie" Restart Prevention**:
   - **Problem**: When a script is managed by systemd with `Restart=always`, a manual `kill` or `stop` command in the script triggers an automatic restart by systemd 10 seconds later.
   - **Solution**: Make the CLI "service-aware". The `stop` command should check `systemctl --user is-active` and call `systemctl --user stop` instead of killing the PID. This ensures a persistent and clean shutdown.

2. **PipeWire/PulseAudio Audio Ducking Confusion**:
   - **Problem**: The user noticed the recording "beeps" were muted while recording an audio message.
   - **Lesson**: Audio "ducking" is a global system behavior. Sounds from background services (like a camera shutter sound) will be lowered in volume or muted by the OS when an input (microphone) is active. This can be misinterpreted as a process failure.
   - **Best Practice**: For discrete background services, **disable audio triggers by default** (`ENABLE_SOUND="false"`) to avoid system interference and "stealth" concerns.

3. **Autonomous Batch Processing**:
   - **Background Workers**: Converting thousands of legacy folders (~1100) into videos should be done via `nohup` or a detached subshell to avoid blocking the main recording loop. 
   - **Reconciliation Logic**: Decoupling metadata extraction from video conversion is essential for reliability. Adding a `reconcile` command that extracts JSON attachments from MKV files allows for 100% recovery of orphaned metadata.

4. **CLI Observability**:
   - **The `info` Command**: For "black-box" autonomous tools, providing a summary of data managed (unprocessed vs. archived, disk usage, active blocking apps) is critical for user trust and transparent status monitoring.

- **Outcome**: Successfully cleared a backlog of 1000+ folders into 2.3GB of highly compressed archived video with full metadata parity and robust privacy blocking.
- [2026-03-28] Lesson Learned: When working with remote cloud instances (like halvarm), if the local Docker daemon has HTTP/HTTPS mismatch with the remote registry, streaming the image via SSH is slow (2GB/link). Instead, use tools like rsync to sync source files to the remote server and run the heavy `docker build` natively on the cloud instance. Avoid pushing rapid unverified WIP iterations through `git push` to keep commit history clean, but once verified, immediately formally commit and push.
