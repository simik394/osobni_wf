# Development Guide - Perplexity Automation

## Project Overview
This project automates querying Perplexity.ai using Playwright in a Dockerized environment. It handles authentication, bot detection evasion, and provides both headful and VNC-enabled headless modes.

## Critical Design Decisions

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
