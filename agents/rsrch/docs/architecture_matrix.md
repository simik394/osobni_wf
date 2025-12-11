# Architecture Decision Matrix: Browser Automation & Stealth

This document tracks the various architectural approaches attempted to achieve robust, undetectable browser automation (specifically for Google Services like NotebookLM and Gemini) within a Dockerized environment.

## Goal
Establish a persistent, authenticated, and undetectable browser session that can be controlled via Playwright from a separate Docker container.

## Decision Matrix

| ID | Auth Strategy | Stealth Configuration | Launch Method | Execution Location | Communication | Outcome | Notes |
|----|--------------|-----------------------|---------------|--------------------|---------------|---------|-------|
| 1 | **Local Login** (Manual) | Standard | `chromium.launch()` (Headless) | Local Host | Pipe | **Failed** | Easily detected by Google ("Browser not secure"). No persistence between runs by default. |
| 2 | **Local Login** (Manual) | `puppeteer-extra-plugin-stealth` | `chromium.launch()` (Headful) | Local Host | Pipe | **Success** | Works for local dev, but requires visible window. Hard to containerize. |
| 3 | `auth.json` (Cookie File) | `puppeteer-extra-plugin-stealth` | `chromium.launch()` (Headless) | Docker | Pipe | **Failed** | Google OAuth session cookies often expire or invalidate when moved between environments/IPs. |
| 4 | **Persistent Context** (`userDataDir`) | `puppeteer-extra-plugin-stealth` | `launchPersistentContext` | Docker | Pipe | **Partial** | Better persistence, but `launchPersistentContext` binds CDP to a local pipe/socket, making it difficult to expose to other containers. |
| 5 | **Persistent Context** | `puppeteer-extra-plugin-stealth` | `launchServer` | Docker | WS (`ws://`) | **Failed** | `launchServer` ignores `userDataDir` in many configurations, creating a temp profile. Authenticated state is lost. |
| 6 | **Persistent Context** (Mounted) | `stealth` + Custom Args | **Direct Spawn** (`child_process`) | Docker | **CDP Direct** (`http://chromium:9222`) | **Failed** | Chrome rejects Host header `chromium:9222`. Only accepts `localhost` or IP. |
| 7 | **Persistent Context** (Mounted) | `stealth` + Custom Args | **Direct Spawn** (`child_process`) | Docker | **CDP + Socat Proxy** | **Success (Current)** | **The Winning Combo.** <br>1. Spawn Chrome directly (preserves User Data).<br>2. `socat` forwards `9222` -> `0.0.0.0:9223`.<br>3. Client resolves Host -> IP to bypass Header check. |

## Detailed Breakdown of the Winning Solution (ID #7)

### 1. Authentication: Mounted Real User Data
Instead of relying on `storageState` JSONs (which miss LocalStorage/IndexDB), we mount the actual Chrome User Data directory.
*   **Action:** Mount host `~/.config/rsrch/user-data` to container `/app/user-data`.
*   **Benefit:** 100% state fidelity. What you see on host Chrome is what the bot sees.

### 2. Stealth: flag-heavy Direct Spawn
We bypass Playwright's launcher to have full control over arguments.
*   **Flags:** `--disable-blink-features=AutomationControlled`, `--disable-web-security`, `--user-agent=...`
*   **Benefit:** Removes many "IsAutomated" flags that Playwright adds by default.

### 3. Communication: The "Socat Sidecar"
Playwright needs to talk to Chrome, but:
a) Chrome only listens on `127.0.0.1` by default.
b) Chrome rejects requests where `Host:` header is not an IP or localhost.

*   **Solution:**
    *   **Server:** `socat TCP-LISTEN:9223,fork,reuseaddr,bind=0.0.0.0 TCP:127.0.0.1:9222` exposes the port.
    *   **Client:** Resolves `chromium` hostname to `172.x.x.x` and connects to `http://172.x.x.x:9223`. This satisfies Chrome's security check.

## Lesson Learned
The hardest part wasn't the "Stealth" (which is solved by standard libraries), but the **Networking & State Persistence** in Docker. The standard Playwright APIs (`launch`, `launchServer`) assume a level of transience or locality that breaks when trying to maintain a long-lived, highly-authenticated session in a distributed Docker environment.
