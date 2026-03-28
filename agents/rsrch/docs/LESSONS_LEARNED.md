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

### 🎙️ NotebookLM Interfacing
- **Modal UI Instability:** NotebookLM retains stale mat-dialog elements. Isolate upload sequences (sequential Bash loops) to clear SPA state between runs.
- **Content Extraction:** Scrape `#region-main` HTML, convert to clean `.txt` (stripping tags) before upload to reduce token waste and improve grounding.

### 🛠️ Performance & Infrastructure
- **Playwright Version Parity:** Base image Playwright version must exactly match `package.json` or launch will silently hang.
- **"Turbo" Dev Loop:** Build locally (`npm run build`) and sync `dist/` to a lean image. Reduces deployment from >5m to ~45s.

---

## 📜 Historical Detailed Logs

<details>
<summary><b>1. Architectural Discovery (2026-01-24) - Windmill vs. CDP</b></summary>

### Context
I spent significant time debugging and "fixing" local CDP/VNC connections for the `rsrch` agent, assuming the server was meant to drive the browser directly. The user later pointed out that this was a "wrong assumption" and that Windmill was the intended solution.

### Root Cause
- I relied on the **current state of the code** (legacy `GeminiClient` with direct CDP calls) as the source of truth for the architecture.
- I missed the **Strategic Plan** (`agents/rsrch/docs/STRATEGIC_PLAN.md`) which explicitly stated the goal of moving to "Windmill flows that compose research operations" and "Complete Windmill integration".

### Lessons
1.  **Read Strategic Docs First:** Check `docs/STRATEGIC_PLAN.md` before major refactoring.
2.  **Code != Architecture:** Existing code represents past decisions, not necessarily the future.
3.  **Search for Orchestrator:** If a project mentions Windmill, assume it handles the heavy lifting.

</details>

<details>
<summary><b>2. NotebookLM Interfacing Detail</b></summary>

### Modal UI Instability
- **Root Cause**: NotebookLM maintains multiple `<add-sources-dialog>` elements. 
- **Effect**: Blind locators may lock onto an older, invisible dialog. 
- **Solution**: Avoid generic click fallbacks with `{ force: true }`. Isolate the entire browser context sequence (run uploads one-by-one).

### Batch Upload Isolation
- **Problem**: Large loops inside Playwright frequently hung. 
- **Solution**: A sequential Bash script `for f in ...; do rsrch notebook add-local-source "$f"; done` is much more reliable. Each file upload utilizes a fresh connection, clearing lingering overlays.

### HTML Scraping & Text Conversion
- **Problem**: LMS platforms (like Moodle) store content in `mod/page` or `mod/book`. Simply downloading attachments missed 70% of content.
- **Solution**: Extract `innerHTML` of `#region-main` and convert to plain `.txt` (stripping tags) before upload.

</details>

<details>
<summary><b>3. Technical Autopsy: Browser Singleton Recovery (2026-01-24)</b></summary>

### The "Silent Hang" Mystery
**Actual Cause: Playwright Version Mismatch.**
- Playwright's Node.js wrapper looked for a binary that didn't exist in the container due to version drift. It hung silently.

### The `package.json` Fragility
**Failure:** relies on relative lookups (`../package.json`) in compiled containerized code.
**Resolution:** Harden metadata lookups. Hardcode versions or create local metadata failsafes during the build.

### The "Stale Lock" Blockade
**Actual Cause:** Stale `SingletonLock` files in persistent profile directory.
**Fix:** Implemented a "Self-Healing" startup script that purges locks.

### The "Turbo" Dev Loop
**The New Standard:** "Build Local, Deploy Dist". Propagate only `dist/` and `package.json`. Result: ~45 second total deployment time.

</details>

<details>
<summary><b>4. Docker CDP Connection Fix (2026-01-11)</b></summary>

### Host Header Validation
Chrome's CDP endpoint rejects non-localhost Host headers.
**Solution:** Added `--remote-allow-origins=*`.

### Port Mapping & Internal DNS
**Solution:** Changed `BROWSER_CDP_ENDPOINT` to use Docker internal DNS: `http://chromium:9223`. Avoid `host.docker.internal`.

### Host Header Rewriting
The CDP endpoint returns `webSocketDebuggerUrl` using `localhost`, breaking cross-container clients.
**Solution:** Node.js HTTP/WebSocket proxy rewrites the Host to `localhost` and rewrites return URLs.

</details>
