# Lessons Learned - rsrch Project

This is a living record of technical challenges, architectural discoveries, and critical fixes. **Always consult this document at the start of a task.**

---

## 🔐 Authentication & Profiles

### Auth Strategy: target-browser login
- **The Problem:** Trying to sync raw Chromium SQLite files (Cookies, Login Data) failed because Chromium encrypts them with user-specific keys. Playwright's `auth.json` injection was often blocked by Google's "Insecure Browser" detection.
- **The Solution:** Use VNC to log in directly to the target production browser container. Once authenticated, the persistent context maintains the session without fragile file transfers.
- **Key Insight:** Don't try to transfer auth credentials. Let the user login once in the production browser environment.

### Local CDP Emulation
- To emulate production locally: Set `USE_WINDMILL=false` and `BROWSER_CDP_ENDPOINT=http://localhost:9225` (mapped container port). This allows rapid iteration on server logic without Windmill deployment loops.

---

## 🏗️ Architecture & Execution

### Code != Architecture (Strategic Planning)
- **Incident:** Spent time fixing direct CDP connections when the strategic goal was moving to Windmill orchestration.
- **Lesson:** Always check `STRATEGIC_PLAN.md` before refactoring. Existing code often represents technical debt, not the intended future direction.

### The Singleton Image Advantage
- ... (existing)

### Docker CDP Connection (Host Header Fix)
- **The Problem:** Chrome's CDP endpoint rejects connections with non-localhost Host headers by default (security feature).
- **The Solution:** Use `--remote-allow-origins=*` flag in Chrome arguments and ensure internal Docker DNS (`http://chromium:9223`) is used for container-to-container talk.
- **Key Insight:** CDP responses often contain hardcoded `localhost` URLs; clients must resolve hostnames to IPs to bypass Host header checks.

### Self-Healing Startup
- **Stale Locks:** Chromium's persistent profile directory often retains `SingletonLock` or `LOCK` files after a crash, blocking future launches.
- **Fix:** Entrypoint scripts MUST explicitly `rm -f` these lock files before starting the browser.

---

## 🎙️ NotebookLM Interfacing

### Modal UI Instability
- **The Problem:** SPA/Angular apps like NotebookLM retain stale mat-dialog elements in the DOM. Blind locators (`.first()`) might hit invisible, inactive dialogs.
- **The Solution:** Isolate upload sequences. Sequential Bash loops (upload one-by-one) are more reliable than large JS loops, as each run clears the SPA state and lingering overlays.

### Content Extraction (Moodle/LMS)
- **Insight:** Simply downloading PDF attachments misses the majority of course content (stored in pages/books).
- **The Solution:** Scrape the `#region-main` HTML, convert to clean `.txt` (stripping tags), and upload as text. This reduces token waste and improves AI grounding quality.

---

## 🛠️ Performance & Infrastructure

### Playwright Version Parity
- **The Problem:** If the Docker base image Playwright version doesn't exactly match the library in `package.json`, browser launch silently hangs (looking for non-existent binary paths like `/ms-playwright/chromium-1208`).
- **Fix:** Ensure base image (`mcr.microsoft.com/playwright`) and `package.json` versions are perfectly aligned. Use `DEBUG=pw:api` to diagnose silent hangs.

### "Turbo" Dev Loop (Build Local, Deploy Dist)
- **Strategy:** Compile TypeScript locally (`npm run build`) and sync only the `dist/` folder to a "Lean" Docker image.
- **Result:** Reduces deployment time from >5 minutes (remote build) to ~45 seconds. Avoids RAM exhaustion on resource-constrained servers.

### CDP Local File Streaming
- **Feature:** `setInputFiles(localPaths)` in a local script connected via CDP to a remote browser automatically streams the files over WebSocket.
- **Risk:** This bypasses Windmill orchestration and can cause collisions in shared browser contexts. Use for ad-hoc sync only.

---

## 📝 General Process

### conventional Commit requirement
- Use YouTrack issue IDs in commits (e.g., `TOOLS-123: fix typo`). 
- Missing trail of change is unacceptable.

### Proof of Work
- Every completed issue/task must have proof (screenshot, log, video) attached to the tracking system before closing.
