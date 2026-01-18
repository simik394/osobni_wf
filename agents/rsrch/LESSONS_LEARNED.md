# LESSONS LEARNED - rsrch Authentication

## 2026-01-18: Auth Restoration Post-Mortem

### What Was Broken

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

## Previous Lessons

- **Local Mode & Auth Injection**: When using Playwright's `launchPersistentContext` in Local Mode (manual launch), cookies from `auth.json` are NOT automatically loaded. You MUST explicitly inject them using `context.addCookies` after context creation to restore authenticated sessions from synced profiles.
