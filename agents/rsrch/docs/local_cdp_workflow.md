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
When running in Windmill:
1.  The Windmill Worker is just a container running TypeScript code.
2.  It cannot see "screen".
3.  It creates a WebSocket connection to the `BROWSER_CDP_ENDPOINT`.
4.  If that endpoint points to your machine (via a tunnel like ngrok or tailscale) or a shared browser container, Windmill drives that browser remotely.
5.  This allows a cloud-based agent to perform actions using your locally authenticated credentials safely.
