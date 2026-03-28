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
