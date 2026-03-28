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

## 🔐 Authentication Recovery (2026-01-18)

### The Problem
- Google login blocks Playwright/Headless browser even with stealth.
- Syncing cookie files (`~/.config/chromium/...`) leads to encryption/permission errors in Docker.

### Key Insight
**Don't try to transfer auth credentials. Let user login once in the target browser.**
The only reliable method: user logs in directly to the production browser via VNC.

### Git Reference
Commit `58dacf4` - Search tag: `[AUTH-WORKING-2026-01-18]`

---

## 📜 General Lessons Learned

- **Tool Definitions Mapping**: Windmill script schemas in YAML are for UI. The MCP server (`main.go`) has its own `inputSchema` that MUST stay in sync.
- **MCP Descriptions**: Name tools by capability (e.g., "Deep Research"), not transient model names.
- **Session Continuity**: `session_id` must be explicitly exposed in the tool schema for multi-turn effectiveness.
- **Local Mode & Auth Injection**: When using `launchPersistentContext` locally, cookies from `auth.json` are NOT auto-loaded. Use `context.addCookies` manually.

---

## 🕒 2026-01-18: CLI & Deployment

### 1. CLI Production Refactor
- All read commands now default to server API. Use `--local` for development loops and `--server` for explicit remote calls.

### 2. Server Endpoint Completeness
- **Incident**: `list-research-docs` was refactored in CLI but missing on server (404). ALWAYS verify server implements the endpoint before refactoring common CLI tools.

### 3. Deployment Bottlenecks
- Large Docker image uploads via SSH are slow. Rely on GitHub Actions/CI to build and push to a registry, then pull on the server.

### 4. Nomad Recovery
- Verify location of Nomad job files (`.nomad.hcl`) before stopping.

---

## 🕒 2026-01-18: SSE & Thought Expansion

### 1. Streaming "Thoughts" from Reasoning Models
- Gemini "Thinking" models hide reasoning behind collapsed buttons.
- **Solution**: Auto-expand `button[aria-label="Show reasoning"]` if `aria-expanded="false"`.
- **Result**: Reasoning text is captured by `innerText()` and streamed via SSE.

### 2. SSE on CLI
- Protocol: `Accept: text/event-stream` header is CRITICAL for server-side streaming triggers.

---

## 🕒 2026-01-23: Codebase & Type Safety

1.  **Dynamic Import Aliasing**: Use `const { GeminiClient: ClientClass }` when dynamic imports shadow existing type imports.
2.  **Private Property Access**: Expose public API methods (`goto`, `wait`) when refactoring classes with private `page` members.
3.  **Template Literal Syntax**: Be careful with astray backticks; they cause cascading syntax errors.

---

## 🕒 2026-01-24: Browser Singleton Recovery

1.  **Playwright Version Parity**: Docker image Playwright version must EXACTLY match `package.json` or launch will silently hang.
2.  **Self-Healing Startup**: Always purge `SingletonLock` and `LOCK` files in entrypoint scripts.
3.  **Turbo Dev Loop**: Build locally and sync `dist/` to lean image. Result: ~45s deployment time.
4.  **Singleton Architecture**: API + Browser in one image (Port 3055/9223) is more stable than sidecars.

**References**: See [Browser Singleton Autopsy (2026-01-24)](file:///home/sim/Obsi/Prods/01-pwf/agents/rsrch/docs/.archive/2026-01-24_singleton_recovery_autopsy.md) for full details.

---

## 🕒 2026-03-23: Local File Sync vs Windmill

### 1. CDP Local File Streaming
- **Feature**: `setInputFiles(localPaths)` in a local script connected via CDP automatically streams files to the remote browser.
- **Problem**: Bypasses Windmill orchestration; can cause collisions in shared browser contexts. Use for ad-hoc sync ONLY.

### 2. Architectural Purity vs Practicality
- **The Pure Way**: Sync files to server (`rsync`) then run Windmill job.
- **The Pragmatic Way**: Use `--local` with remote CDP endpoint. Faster but violates "Windmill handles all execution" rule.

---

## 📜 Full Verbatim Logs (Archived Files)

### [[Architectural Discovery - Windmill vs. CDP]](file:///home/sim/Obsi/Prods/01-pwf/agents/rsrch/docs/.archive/lessons_learned_architecture.md)
*Full text restored in .archive/lessons_learned_architecture.md*
- Key Lesson: Code != Architecture. Read `STRATEGIC_PLAN.md` first.

### [[NotebookLM Interfacing Detail]](file:///home/sim/Obsi/Prods/01-pwf/agents/rsrch/docs/.archive/lessons_learned_notebooklm.md)
*Full text restored in .archive/lessons_learned_notebooklm.md*
- Key Lesson: Modal UI instability requires sequential upload isolation.

### [[Docker CDP Connection Fix (2026-01-11)]](file:///home/sim/Obsi/Prods/01-pwf/agents/rsrch/docs/.archive/lessons-learned-docker-cdp-fix.md)
*Full text restored in .archive/lessons-learned-docker-cdp-fix.md*
- Key Lesson: Host header validation requires `--remote-allow-origins=*`.
