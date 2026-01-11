# Development Guide - Perplexity Automation

## ⚠️ CRITICAL AGENT PROTOCOLS

> [!CAUTION]
> ### 🚨 VERIFY BEFORE STATING AS FACT 🚨
>
> **NEVER state uncertain information as truth.** If you are not 200% certain about something:
> 1. **STOP** - Do not include it in your answer
> 2. **VERIFY FIRST** - Use `search_web`, `rsrch`, `read_url_content`, or other tools
> 3. **ONLY THEN** state it as fact
>
> **If unsure and can't verify:** Say "I'm not certain about X, let me check..." then actually check.

### Research Escalation
After **2-3 failed `search_web` attempts**:
1. **DO NOT keep spinning** on more simple searches
2. **ESCALATE to `rsrch`** - use deep research capability for comprehensive investigation
3. Only after `rsrch` also fails → ask user for direction.

**Tool hierarchy:** `search_web` (quick) → `rsrch gemini query/deep-research` (comprehensive) → ask user (last resort)

### rsrch Modes
| Mode | Command | Speed | Reliability | Use Case |
|------|---------|-------|-------------|----------|
| **Regular Query** | `rsrch gemini query "prompt"` | Fast (seconds) | ~80% reliable | Quick lookups, general questions |
| **Deep Research** | `rsrch gemini deep-research "prompt"` | Slow (minutes) | High reliability | Questions that MUST be true and accurate |

**Critical constraint:** Deep research mode can ONLY be turned on for NEW sessions.

## Task Management Rules (YouTrack)
### When to create YouTrack issues:
- **Major Tasks**: Create issue, delegate to Jules or track for later.
- **Micro Tasks**: Execute manually, BUT still create closed issue for tracking.
- **Blocking**: Do it yourself with available non-AI tools (fastest solution).

### Tracking Requirements:
- **Missing track of change is UNACCEPTABLE**.
- **Commit messages**: Mention YouTrack issue ID (e.g., `TOOLS-123: fix typo`).
- **Progress**: Update checkboxes IMMEDIATELY. Add timestamps `[Started: HH:MM]` and `[x] Task - [HH:MM-HH:MM]`.
- **Proof**: **Every completed issue MUST have proof** (screenshot, log, video) attached before closing.

### Work Discovery:
1. **Find work** → `mcp_napovedayt_search_issues` (`for: me #Unresolved`)
2. **Do the work** → Implement, test, verify, attach proof.
3. **Close the issue** → Mark complete.
4. **Repeat**.

## Proactive Assumptions
- **Never ask for confirmation on obvious next steps**.
- Preface actions with bold `**Assumptions:**` when making non-trivial decisions.
- **Lessons Learned**: ALWAYS search for and consult `LESSONS_LEARNED.md` at the start of a task. Update it after finishing.

## User Mandates
- **Backup First**: Ensure content is backed up before removing.
- **Docker > Local**: Prefer Docker containers.
- **Scripts > Ad-hoc**: Create reusable scripts.

## Context Window Monitoring
- **Report**: "📊 Context: ~XK tokens remaining (Y% used)" every 2-5 responses.
- **Warn**: "⚠️ Context getting full" below 50K tokens.

## Jules Interaction
1. **`jules-cli` (PRIMARY)**: List, get, status, retry.
2. **`jules-mcp` (PRIMARY)**: Create, approve, send_message.
3. **`browser_subagent` (LAST RESORT)**: UI-only ops.

> **Full delegation guidelines:** See [@flows/autonomous-pm-framework.md](file:///home/sim/Obsi/Prods/01-pwf/flows/autonomous-pm-framework.md) for:
> - When to delegate vs. do yourself
> - Jules → YouTrack state mapping
> - Monitoring and intervention patterns

---

## Project Overview
This project automates querying Perplexity.ai using Playwright in a Dockerized environment. It handles authentication, bot detection evasion, and provides both headful and VNC-enabled headless modes.

## Critical Design Decisions

### ⚠️ 0. NON-BLOCKING AUDIO GENERATION (MANDATORY)

> [!CAUTION]
> **THIS ARCHITECTURE IS MANDATORY. DO NOT CHANGE WITHOUT EXPLICIT USER REQUEST.**

NotebookLM processes audio generation on cloud servers in PARALLEL. Multiple generations can run simultaneously.

**Architecture:**
```
Click Script → Trigger gen → Set watcher → RETURN IMMEDIATELY
                                    ↓
Watcher (background) → Monitor page → Call webhook on complete
                                    ↓
Webhook → FalkorDB update → ntfy notification
                                    ↓
Queue → Next click job runs (parallel with previous)
```

**FORBIDDEN:**
- `await waitForGeneration()` - NEVER block
- `while (generating) { sleep }` - NEVER poll
- Assuming sequential generation - IT'S PARALLEL

**REQUIRED:**
- Trigger and return immediately
- Reuse existing browser tab when possible
- Multiple generations run in parallel

### 1. Persistent Browser Context (Not Storage State)
**Decision:** Use `launchPersistentContext()` instead of `storageState` saving/loading.

**Rationale:**
- Google OAuth and complex logins don't always persist correctly with storage state
- Persistent context maintains ALL browser state (cookies, local storage, service workers)
- More robust for long-running authenticated sessions

**Implementation:**
```typescript
const context = await chromium.launchPersistentContext(
  config.auth.browserDataPath,
  { headless: false }
);
```

**Key Point:** The browser data directory (`playwright/.browser-data/`) must be volume-mounted and excluded from Docker builds.

### 2. Stealth Mode for Bot Detection
**Challenge:** Cloudflare detects standard Playwright automation and blocks requests.

**Solution:** Use `playwright-extra` with `puppeteer-extra-plugin-stealth`.

**Critical Code:**
```typescript
import { chromium } from 'playwright-extra';
import stealth from 'puppeteer-extra-plugin-stealth';
chromium.use(stealth());
```

**Lesson:** Standard headless mode (`headless: true`) is detected more easily. Always use headful or Xvfb with stealth.

### 3. VNC for Headless Debugging
**Challenge:** Need automation to run in background but still be debuggable.

**Solution:** Run browser in Xvfb (virtual display) with x11vnc server.

**Architecture:**
```
entrypoint.sh → Xvfb :99 → Fluxbox → x11vnc → Application
```

**Key Files:**
- `entrypoint.sh`: Orchestrates startup
- `Dockerfile`: Installs xvfb, x11vnc, fluxbox
- `docker-compose.yml`: Exposes port 5900

**Lesson:** True headless (`headless: true`) may behave differently with Cloudflare. VNC provides best of both worlds.

### 4. Smart Answer Detection
**Challenge:** Waiting for `networkidle` is slow (500ms+ of no network activity).

**Solution:** Multi-strategy detection:
1. Primary: Watch for "Stop generating" button to disappear
2. Fallback: Text stability check (answer unchanged for 1 second)

**Performance Impact:** Reduced query time from ~30+ seconds to ~15-20 seconds.

### 5. Robust CDP Connection in Docker
**Challenge:** Connecting to a browser inside a Docker container from another container or host via CDP (`chromium.connectOverCDP`) often fails due to Chrome's security checks on the `Host` header (rejects non-localhost).

**Solution:**
1. **Infrastructure:** Use `socat` in the browser container to forward the local CDP port (9222) to an exposed port (9223) that binds to `0.0.0.0`.
2. **Client-Side:** In `src/client.ts`, resolve the container's hostname to an IP address before connecting.
   - Chrome accepts connections if the Host is an IP address, but rejects hostname aliases (like `chromium:9223`).
   - We perform a DNS lookup of `process.env.BROWSER_CDP_ENDPOINT`'s hostname and construct the WebSocket URL using the direct IP.

**Critical Code:**
```typescript
// Resolve hostname to IP to bypass Host header check
const lookup = promisify(dns.lookup);
const result = await lookup(host);
cdpEndpoint = `http://${result.address}:${url.port}`;
```

### 6. Concurrency & Scaling Architecture (Hybrid Model)

> [!IMPORTANT]
> **Understanding the "Why":** We rely on a singleton browser container to maintain persistent authentication state (avoiding bot detection), but we must scale to handle 20+ concurrent sessions.

**The Solution: Hybrid Concurrency**

1.  **Horizontal Scaling (Windmill Workers):**
    -   **Role:** Stateless orchestration logic.
    -   **Mechanism:** Windmill spawns ephemeral containers for each request (e.g., plan review).
    -   **Behavior:** "Submit & Watch" pattern.
    -   **Scale:** Unlimited (constrained only by cluster resources).

2.  **Vertical Scaling (Browser Singleton):**
    -   **Role:** Stateful execution (rendering, clicking).
    -   **Mechanism:** **TAB POOLING** within the single browser instance.
    -   **Scale:** Limited by RAM (`MAX_TABS = 5` by default).

**The "Submit & Passive Watcher" Pattern**

To bridge the gap between "Unlimited Workers" and "Limited Tabs", we use a non-blocking pattern:

1.  **Submit:** Worker acquires a tab, submits the prompt, and **immediately returns**.
2.  **Watch:** Worker sets up a **Passive Watcher** on the DOM.
3.  **Result:**
    -   The browser tab sits idle (waiting for network) while the LLM generates (15-30s).
    -   The browser event loop is free to handle *other* tabs.
    -   We achieve parallelism *interleaved* within the single thread.

> [!CRITICAL]
> **TAB PERSISTENCE REQUIRED:**
> The "Passive Watcher" relies on a `MutationObserver` attached to the *live* DOM context.
> **Browser tabs MUST NOT be reloaded during active monitoring.**
> Reloading the page destroys the observer and the JS execution context, breaking the stream/watch process.
> The tab must remain open and untouched until the LLM generation is complete.

**ANTI-PATTERNS (DO NOT DO):**
-   ❌ **Blocking Wait:** `await page.waitForSelector(...)` for 30s blocks the entire Node event loop if not careful.
-   ❌ **Parallel Browsers:** Launching 5 docker containers of `rsrch` will trigger Cloudflare immediately due to shared volume contention or suspicious IP activity.
-   ❌ **Sequential Queuing:** Queuing requests 1-by-1 at the API level destroys throughput. Use the Tab Pool.

## Critical Configurations

### Docker Setup

#### `.dockerignore`
**Must exclude persistent data directories:**
```
playwright/.browser-data
playwright/.browser-data-fresh
data/results
```

**Why:** These directories can have root ownership or permission issues that break Docker builds.

#### `Dockerfile`
**Critical elements:**
```dockerfile
ENV DEBIAN_FRONTEND=noninteractive
ENV TZ=UTC
```

**Why:** Prevents interactive timezone prompts that hang builds.

#### `docker-compose.yml`
**User mapping for permissions:**
```yaml
user: "${UID:-1000}:${GID:-1000}"
```

**Why:** Ensures container user matches host user for volume write permissions.

**VNC configuration:**
```yaml
ports:
  - "5900:5900"
entrypoint: ["/entrypoint.sh"]
environment:
  - DISPLAY=:99
```

### Selector Strategy
**Always use fallback arrays:**
```typescript
queryInput: [
  'textarea[placeholder*="Ask"]',
  'textarea',
  'input[placeholder*="Ask"]',
  'div[contenteditable="true"]'
]
```

**Why:** Perplexity UI may change. Fallbacks increase robustness.

## Common Pitfalls & Solutions

### 1. Permission Denied Errors
**Symptom:** `EACCES: permission denied` when writing results.

**Causes:**
- Data directory owned by root (from sudo commands)
- Docker user mapping mismatch

**Solutions:**
- Ensure `data/results/` is owned by host user
- Check `.dockerignore` excludes the directory
- Verify `user:` directive in docker-compose.yml

### 2. X11 Display Errors
**Symptom:** `Missing X server or $DISPLAY`

**Cause:** `xhost` permissions reset after reboot.

**Solution:**
```bash
xhost +local:docker
```

**Note:** Must be run after every system restart.

### 3. Cloudflare Challenges
**Symptom:** Login fails, captchas appear, or queries timeout.

**Causes:**
- Not using stealth mode
- Using true headless (`headless: true`)
- Virtual display fingerprinting differences

**Solutions:**
- Always use `playwright-extra` with stealth plugin
- Use headful mode or Xvfb (not `headless: true`)
- If issues persist, use headful mode with X11 forwarding

### 4. Selector Timeouts
**Symptom:** `waiting for locator('...') to be visible` timeout.

**Causes:**
- UI changed
- Element not visible in viewport
- Wrong selector

**Solutions:**
- Check actual HTML with debug script
- Update selectors in `src/config.ts`
- Add new selectors to fallback array

### 5. Docker Build Hangs
**Symptom:** Build stuck at "Geographic area" prompt.

**Cause:** Interactive apt configuration prompts.

**Solution:** Always set in Dockerfile:
```dockerfile
ENV DEBIAN_FRONTEND=noninteractive
ENV TZ=UTC
```

## Development Workflow

### Rule 1: Develop Inside Docker
**Always run commands via Docker Compose:**
```bash
docker compose run --rm app npm run <script>
```

**Why:** Keeps host environment clean, ensures consistency.

### Rule 2: Authentication First
Before querying, run authentication once:
```bash
xhost +local:docker  # If using headful mode
docker compose run --rm app npm run auth
```

**Note:** Session persists in `playwright/.browser-data/`.

### Rule 3: Test Both Modes
When making changes, verify:
1. **Headful mode** (with `xhost +local:docker`)
2. **VNC mode** (with `--service-ports`)

**Why:** They may behave differently with Cloudflare.

### Rule 4: Update .dockerignore
When adding new persistent directories, immediately add to `.dockerignore`.

## Debugging

### Enable Playwright Debug Logs
Already enabled via:
```yaml
environment:
  - DEBUG=pw:api
```

### View Browser with VNC
```bash
docker compose run --rm --service-ports app npm run query "test"
# Connect VNC viewer to localhost:5900
```

### Check Actual HTML
Create debug script:
```typescript
const html = await page.content();
console.log(html);
```

## Handoff Checklist

When handing off to another developer/agent:

- [ ] Ensure they have VNC viewer installed (for debugging mode)
- [ ] Explain `xhost +local:docker` requirement (if using headful)
- [ ] Show location of browser data (`playwright/.browser-data/`)
- [ ] Point to selector configuration (`src/config.ts`)
- [ ] Explain stealth mode requirement (don't remove it!)
- [ ] Warn about permission issues with `data/` directories
- [ ] Show VNC connection instructions
- [ ] Explain the two modes: headful vs VNC

## Key Files Reference

| File | Purpose | Critical Points |
|------|---------|----------------|
| `src/config.ts` | Selectors & paths | Update selectors when UI changes |
| `src/auth.ts` | Authentication | Uses persistent context |
| `src/query.ts` | Query execution | Smart answer detection logic |
| `Dockerfile` | Container image | Must set DEBIAN_FRONTEND |
| `docker-compose.yml` | Service config | User mapping, port exposure |
| `entrypoint.sh` | VNC startup | Orchestrates Xvfb + x11vnc |
| `.dockerignore` | Build exclusions | Must exclude browser data |

## Performance Benchmarks

- **Initial version:** ~30-40 seconds per query
- **Optimized version:** ~15-20 seconds per query
- **Improvement:** ~50% faster

**Optimization techniques:**
1. Removed `networkidle` waits
2. Smart button detection
3. Reduced selector timeouts
4. Text stability checks

## Feature: NotebookLM Audio Dry Run

### Goal
Simulate the generation of an Audio Overview to verify UI steps without consuming daily quota.

### Implementation Details
- **Logic**: Inspects `src/notebooklm-client.ts` -> `generateAudioOverview`.
- **Detection**: Checks if audio already exists using regex `/Audio (Overview|přehled)|audio_magic_eraser/i`. The `audio_magic_eraser` string is specific to the user account's artifacts.
- **Generating State**: Checks for "Generating" status to avoid duplicate requests.
- **Dry Run**: If enabled, performs all steps but *skips* the final click on the generate button.

### Environment Notes
- **Local (Headed/Headless)**: Works reliably.
- **Docker**: Currently experiences timeouts in `page.waitForSelector`. This is an infrastructure issue likely related to resource constraints or slower rendering in the container.

## Feature: Perplexity Multi-Turn Sessions

### Goal
Reuse existing conversation contexts for follow-up questions using session IDs or names.

### Implementation Details
- **Storage**: Sessions are stored in-memory in `src/client.ts`.
- **API**: `/query` endpoint accepts `session: "name"` or `session: "id"`.

### Known Issues
- **Answer Extraction Fragility**: In multi-turn threads, targeting the correct "last" answer container is unstable.
- **Docker Timeout**: The stability check mechanism (waiting for text to stop changing) often times out or crashes the server in the Docker environment when dealing with multiple answer containers. Use local environment for logic development.

## Feature: Gemini Deep Research
### Goal
Automate Google's Gemini "Thinking" model to perform deep research and export results to Google Docs.

### Implementation Details
- **Client**: `src/gemini-client.ts` uses a persistent Playwright context (shared with Perplexity/NotebookLM).
- **Selector Strategy**: 
  - Detects "Deep Research" toggle (Thinking model).
  - Handles the "Confirm plan" interaction which is unique to Deep Research.
  - Detects completion by monitoring the "Researching..." status indicators.
- **Export**: Automates the "Export to Docs" button click and retrieves the new document's title / heading to return to the API.

## Feature: Job Persistence & Recovery

### Goal
Ensure that long-running async tasks (like `research-to-podcast`) are not lost if the server process crashes or restarts.

### Architecture Design
1.  **Persistence Layer**:
    *   **Mechanism**: JSON file storage (`data/jobs.json`).
    *   **Decision**: Chosen over SQLite or Redis to keep the architecture dependency-free and lightweight (using existing `data/` volume).
    *   **Behavior**: The `JobQueue` class writes to this file synchronously whenever a job is added or updated.

2.  **Recovery Logic**:
    *   **On Startup**: The server calls `jobQueue.load()` to restore state from disk.
    *   **Interruption Handling**: It scans for jobs with `status: 'running'`. Since the server just started, any "running" job was necessarily interrupted.
    *   **Resolution**: These jobs are marked as `failed` with the error "Interrupted by server restart/crash".
    *   **Notification**: A Discord alert is sent immediately so the user knows the job failed and can retry.

### Trade-offs
*   **Pros**: Simple, zero extra deps, robust enough for single-instance use.
*   **Cons**: Does not *resume* the work (e.g., does not reconnect to an orphaned browser page). Resuming complex multi-step browser automation from an arbitrary mid-point is significantly more complex and error-prone. "Fail fast and notify" is the safer implementation.

## Future Considerations

### Potential Improvements
1. **Headless true mode:** May require additional fingerprinting evasion
2. **Batch optimization:** Reuse context for multiple queries
3. **Error recovery:** Auto-retry on Cloudflare challenges
4. **Session refresh:** Detect and re-authenticate when session expires

### Known Limitations
1. **Manual login required:** Initial authentication can't be automated
2. **Rate limiting:** Perplexity may rate-limit heavy usage
3. **UI fragility:** Selectors may break on UI updates
4. **Cloudflare sensitivity:** Behavior may vary by IP/environment

## Troubleshooting Guide

### Query Fails Immediately
- Check authentication: Re-run `npm run auth`
- Verify `playwright/.browser-data/` exists and has saved session

### Slow Performance
- Disable debug logging: Remove `DEBUG=pw:api`
- Check network: Slow connection affects Perplexity response time
- Monitor stability checks: May need tuning if answers generate slowly

### Can't Connect to VNC
- Verify port 5900 not in use: `lsof -i :5900`
- Confirm `--service-ports` flag used
- Check firewall settings

### Build Errors
- Clear Docker cache: `docker compose build --no-cache`
- Check `.dockerignore` for excluded directories
- Verify all files committed to git

## Contributing Guidelines

1. **Never commit sensitive data:**
   - `playwright/.browser-data/` is gitignored
   - `data/results/` is gitignored

2. **Test before committing:**
   - Run at least one successful query
   - Verify both headful and VNC modes work

3. **Update selectors carefully:**
   - Always maintain fallback array
   - Test thoroughly after changes

4. **Document breaking changes:**
   - Update this guide if architecture changes
   - Note in commit message if behavior changes

5. **Keep Docker lean:**
   - Don't add unnecessary dependencies
   - Keep image size reasonable

---

**Last Updated:** 2025-11-25  
**Project Status:** Production Ready  
**Maintainer:** Development Team
