# Rsrch Agent Architecture: The "Split-Brain" Model

The `rsrch` system uses a **Split-Brain Architecture** to decouple the **Execution Logic** (Windmill/CLI) from the **State/Interaction Layer** (The Browser).

## The Problem with Traditional Automation
Traditional automation scripts (e.g., standard Playwright) often launch a browser, do work, and close it. This fails for advanced AI agents because:
1.  **State Loss**: Logging into complex services (Gemini, NotebookLM) takes time and challenges (2FA). Starting fresh every time is impossible.
2.  **Detection**: Frequent logins from new "clean" browser instances flag security systems.
3.  **Context Switching**: An agent might need to "check something" in an already open session without reloading the page.

## The Solution: Split Architecture

### 1. The Head (The Browser / State Layer)
This is a **Persistent, Long-Running Process**. It holds the session cookies, the open tabs, and the DOM state.
*   **Role**: Dumb execution vessel. It just sits there, logged in, waiting for commands.
*   **Location**: Can be a Docker container (`browser` service) or **Your Local Browser**.
*   **Interface**: It exposes the **Chrome DevTools Protocol (CDP)** on a port (default: 9222).
*   **Persistence**: It stays running even when no script is controlling it.

### 2. The Brain (Windmill / CLI / Control Layer)
This is the **Ephemeral Logic**. It contains the `rsrch` code, the prompts, and the decision making.
*   **Role**: The Pilot. It connects to the Head, pulls the levers (clicks buttons, reads text), and then disconnects.
*   **Location**: Runs in a Windmill Worker (Remote) or your Terminal (Local CLI).
*   **Lifecycle**: Born for a specific task ("Scrape Session #123"), dies immediately after completion.

## How It Works Together
```mermaid
graph TD
    subgraph "Ephemeral Logic Layer"
        CLI[Local CLI (rsrch)]
        WM[Windmill Worker]
    end

    subgraph "Persistent State Layer"
        Browser[Your Browser (Chrome)]
        Tabs[Open Tabs (Gemini/NotebookLM)]
    end

    CLI -- Connects via CDP (ws://) --> Browser
    WM -- Connects via CDP (ws://) --> Browser

    Browser -- Holds State --> Tabs
```

1.  **Browser Starts**: You launch Chrome with `--remote-debugging-port=9222`.
2.  **User Logs In**: You manually log into Gemini/Google. The browser saves these cookies to your local profile.
3.  **Agent Wakes Up**: A Windmill script starts. It reads `BROWSER_CDP_ENDPOINT`.
4.  **Connection**: The script "attaches" to your running browser via WebSocket. It does **NOT** launch a new Chrome.
    *   It sees what you see.
    *   It can reuse your existing tabs.
    *   It behaves like a "ghost user" taking over the mouse/keyboard.
5.  **Task**: The agent scrapes data, maybe opens a new tab, saves results to a database.
6.  **Disconnect**: The script finishes and disconnects. **Your browser stays open.** You remain logged in.

## Guide: Using Your Local Browser as the "Head"

This is the preferred way for development and debugging, or if you want agents to work on your behalf on your local machine.

### Step 1: Launch Chrome with Remote Debugging
You must launch Chrome from a terminal with specific flags.

**Linux:**
```bash
google-chrome --remote-debugging-port=9222 --user-data-dir=./my-chrome-profile
```
*   `--remote-debugging-port=9222`: Opens the CDP port for the agent.
*   `--user-data-dir=...`: (Optional but recommended) Uses a specific profile so your main browsing isn't affected.

### Step 2: Configure the Agent
Tell `rsrch` where to find your browser.

**Env Var:**
```bash
export BROWSER_CDP_ENDPOINT=http://localhost:9222
```
**Or Config File (`.env` or `config.json`):**
```json
{
  "browserCdpEndpoint": "http://localhost:9222"
}
```

### Step 3: Run the CLI
Now, when you run commands, the CLI will look for that port instead of trying (and failing) to launch its own browser.

```bash
# This will attach to your open Chrome, scrape the current tab, and print results
rsrch gemini scrape-session
```

### Safety & Policy
*   **Strict Mode**: The `rsrch` codebase has been updated to **Prohibit** launching new local browsers programmatically by default. This forces agents to use this CDP architecture, ensuring they don't accidentally spawn hidden windows or bypass your authenticated session.
*   **Override**: If you absolutely must launch a fresh temporary browser for testing, use `FORCE_LOCAL_BROWSER=true`.

## Integration with Windmill

The critical question is: **How does the Windmill Worker reach your Local Browser?**

There are two main ways to set this up.

### Scenario A: The Local Windmill Worker (Easiest)
If you run a Windmill Worker on the **same machine** as your browser:
1.  **Browser**: Running locally on port 9222.
2.  **Worker**: Running locally (native binary or Docker with host networking).
3.  **Connection**: The worker script simply connects to `http://localhost:9222`.
4.  **Credentials**: It uses your open browser tabs. You are already logged in.

*Advantage:* Zero network configuration.
*Disadvantage:* You must keep a Windmill worker running on your laptop.

### Scenario B: The Remote Cloud Worker (Advanced)
If Windmill is running in the cloud (e.g., specific managed instance) but you want it to use your **Local Browser** credentials:
1.  **Browser**: Running locally on port 9222.
2.  **Tunnel**: You must expose port 9222 to the internet (securely).
    *   **Ngrok**: `ngrok http 9222` -> gives you `https://random-id.ngrok-free.app`
    *   **Tailscale**: Expose via Funnel or just Meshnet IP.
    *   **Cloudflare Tunnel**: `cloudflared access ...`
3.  **Worker**: Configured with `BROWSER_CDP_ENDPOINT=https://random-id.ngrok-free.app`.
4.  **Connection**: The cloud worker sends commands through the tunnel to your local browser.

*Advantage:* No specific worker process needed on your machine.
*Disadvantage:* Latency can be higher; requires setting up a secure tunnel.

### Does the Worker need my Password?
**NO.** The worker never sees your Google password.
*   It does **not** perform a login flow (typing email/password).
*   It attaches to an **already authenticated session**.
*   It Piggybacks on your existing cookies.
*   If your local browser logs out, the agent fails. It cannot log you back in.

This is a security feature: The credentials (cookies/tokens) never leave your local machine's memory/disk (except strictly as necessary for the CDP protocol traffic).

## Server-Side / Fully Automated Workflow

The architecture is designed as **"Browser as a Service"** (Two Containers).

Instead of the Node.js script starting a child Chrome process, it relies on Chrome running as a **separate, persistent daemon (container)**. This was always the intended design for stability and state management.

### Architecture
*   **Container A (`browser`)**: This is a **VNC-enabled Browser Container**. It runs Chrome *headed* inside Xvfb, exposing port 5900 (VNC) and 9222 (CDP).
*   **Container B (`rsrch`)**: Runs the agent script. It connects efficiently via WebSocket to `browser:9222`.

### Why?
1.  **Manual Auth via VNC**: You VNC into `Container A` to log in manually (Google/Gemini). The agent in `Container B` then inherits this session via CDP.
2.  **Visual Debugging**: You can watch the agent work in real-time by keeping the VNC window open.
3.  **Resilience**: Separating the heavy browser process from the lightweight Node script prevents crashes from propagating.

### "Can I still use `launchPersistentContext`?"
Only if you set `FORCE_LOCAL_BROWSER=true`.
But for production server automation, we strongly recommend the **Dual-Container** approach described above.

