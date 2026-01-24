# LESSONS LEARNED - rsrch Authentication

### Valid Windmill Local Emulation
To emulate production behavior locally (using local heavy containerized browser but local server logic):
1. **Bypass Windmill**: Set `USE_WINDMILL=false` to force local execution instead of delegation.
2. **Connect to Container**: Set `BROWSER_CDP_ENDPOINT=http://localhost:9225` (mapped port) to use the `rsrch-chromium` container.
3. **Use Production CLI**: Use `rsrch gemini send-message` which uses SSE.
This allows iterating on server/browser logic without waiting for Windmill deployment loops.

## 2026-01-18: Auth Restoration Post-Mortem

### What Was Broken
- **Windmill Relative Imports**: When deploying Windmill scripts that import from parent directories (e.g. `../../dist`), ensure the import path depth matches the folder structure in Windmill. Windmill scripts in folders (e.g. `f/rsrch/script.ts`) effectively run deeper than local source handling might suggest during build time if not careful with `bun` or module resolution.

1. **CDP Endpoint Disabled**
   - `docker-compose.yml` had `BROWSER_CDP_ENDPOINT` commented out
   - rsrch server was running in "Local Mode" (launching its own browser in container)
   - But the local browser had NO authenticated session

2. **Encrypted Cookie Files**
   - `profile-sync.ts` copied raw SQLite files (Cookies, Login Data, etc.)
   - **PROBLEM**: Chromium encrypts cookies with user-specific key
   - Copied files are UNREADABLE by destination browser
   - This explains why synced cookies never worked

3. **auth.json vs Raw Files Mismatch**
   - `loadStorageState()` expects Playwright JSON format (`auth.json`)
   - profile-sync copied raw browser SQLite files to `state/` directory
   - `addCookies()` injection was attempted but persistent context already loaded stale cookies
   - Format mismatch: JSON injection can't override SQLite-loaded cookies

4. **Playwright Browser Detection**
   - Even with stealth plugin, Google detects Playwright automation
   - "This browser may not be secure" error blocks manual login
   - Cannot authenticate fresh session in Playwright-controlled browser

5. **default Profile Missing auth.json**
   - `~/.rsrch/profiles/default/` had `state/` directory but no `auth.json`
   - `work/` and `personal/` profiles HAD valid auth.json but wrong profile was used

### What Fixed It

1. **VNC Login to Browser Container**
   - User logs into Google manually via VNC (localhost:5902)
   - Container's persistent browser maintains session
   - No Playwright fingerprinting issues

2. **Enabled CDP Connection**
   - Uncommented `BROWSER_CDP_ENDPOINT=http://chromium:9223`
   - rsrch server connects to pre-authenticated browser via CDP
   - No need to transfer cookies at all

3. **Cloned Chromium Profile to Container**
   - Copied `~/.config/chromium/Profile 1` to `~/.config/rsrch/user-data`
   - Fixed permissions (sudo rm root-owned files)
   - This gave container a starting profile, but user still needed VNC login

### KEY INSIGHT

**Don't try to transfer auth credentials. Let user login once in the target browser.**

The entire profile-sync approach is fundamentally flawed because:
- Raw cookie files are encrypted per-browser
- Playwright's storageState JSON works but browser fingerprinting blocks Google login
- Only reliable method: user logs in directly to the production browser

### Git Reference

Commit `58dacf4` - Search tag: `[AUTH-WORKING-2026-01-18]`

---

## Previous Lessons Learned

- **Tool Definitions Mapping**: Windmill script schemas in YAML are primarily for the Windmill UI. The MCP server (`main.go`) has its own `inputSchema` definition which MUST be kept in sync with the underlying Go scripts to ensure parameters are correctly passed.
- **MCP Descriptions**: Avoid naming tools after transient model names (e.g., "Gemini Pro") if they actually represent a specific capability/mode (e.g., "Deep Research"). This prevents user confusion when models evolve.
- **Session Continuity**: For agents to effectively use multi-turn tools, the `session_id` must be explicitly exposed in the tool schema, even if the underlying API supports it implicitly or via conversation history.

- **Local Mode & Auth Injection**: When using Playwright's `launchPersistentContext` in Local Mode (manual launch), cookies from `auth.json` are NOT automatically loaded. You MUST explicitly inject them using `context.addCookies` after context creation to restore authenticated sessions from synced profiles.

## 2026-01-18: CLI Production Refactor & Deployment

### What Was Done
1.  **Refactored CLI to Production-First**: All read commands (`list-sessions`, `get-research-info`, etc.) now default to server API.
    - Added `--local` flag for development loop.
    - Added global `--server` option.

2.  **Server Endpoint Completeness**: 
    - **Lesson**: When refactoring CLI to use server, ALWAYS verify server implements the corresponding endpoint.
    - **Incident**: `list-research-docs` was refactored in CLI but missing on server, causing 404. Had to quick-fix server.

3.  **Deployment & Bottenecks**:
    - **Lesson**: Large Docker image uploads from local machine (via `docker save | ssh load`) are bandwidth-constrained.
    - **Solution**: Rely on GitHub Actions/CI for building and pushing images from cloud to registry, then pull on server.
    
4.  **Nomad Recovery**:
    - **Lesson**: Verify location of Nomad job files (`.nomad.hcl`) before stopping jobs.
    - **Incident**: Stopped job expecting to run local file, but file wasn't present. Had to find it on server (`/opt/nomad/jobs/rsrch.nomad.hcl`).

## 2026-01-18: SSE Streaming & Thought Expansion

### 1. Streaming "Thoughts" from Reasoning Models
- **Challenge**: New Gemini reasoning models (Gemini 2.0 Flash Thinking) hide reasoning behind a collapsed UI element ("Show reasoning" / "Myšlenkový proces").
- **Solution**:
    - **Auto-Expansion**: Implemented a check in the scraping loop (`GeminiClient.sendMessage`) to detect `button[aria-label="Show reasoning"]`.
    - **Action**: Script automatically clicks the button if `aria-expanded="false"`.
    - **Result**: The reasoning text becomes part of the DOM and is captured by standard `innerText()` scraping, allowing it to be streamed via SSE seamlessly.

### 2. SSE on CLI
- **Issue**: Naive printing in CLI caused overwrites of previous multi-line chunks.
- **Fix**: Implemented delta-based printing or full-text replacement with caret management.
- **Protocol**: `Accept: text/event-stream` header is CRITICAL for server to trigger streaming mode. Always verify headers when debugging 404/empty responses.

## 2026-01-24: Browser Singleton Recovery & Loop Optimization

1.  **Playwright Version Parity**: Compiled code caches binary paths (e.g., `/ms-playwright/chromium-1208` for `v1.58.0`). If the Docker base image version doesn't EXACTLY match the library version in `package.json`, browser launch will silently hang or fail.
2.  **Self-Healing Startup**: Always purge `SingletonLock` and `LOCK` files in entrypoint scripts for containerized Chromium with persistent profiles. Stale locks from previous container crashes are a primary cause of "Initialization Hangs".
3.  **Turbo Dev Loop (Build Local, Deploy Dist)**: For monorepos, building TypeScript locally and syncing `dist/` folders to a "Lean" Docker image is 10x faster and more reliable than remote container builds.
4.  **Singleton Architecture**: Combining API and Browser into a single image (exposed via Port 3055 and CDP 9223) is significantly more stable than sidecar network delegation for orchestration.

**References**: See [Browser Singleton Autopsy (2026-01-24)](file:///home/sim/Obsi/Prods/01-pwf/agents/rsrch/docs/2026-01-24_singleton_recovery_autopsy.md) for full details.


