# Session Insights & Patterns (2025-12-11)

> [!NOTE]
> The specific message "for the deep research you need to switch..." was not found in the current accessible context. This analysis covers the active session focusing on Dockerized Google Automation and Persistence key debugging.

# A) Information for Future Agents

## Technical Context: Google Automation in Docker
*   **The "Secure Browser" Block:** Google's anti-automation successfully detects standard Playwright contexts (`launchServer`, `launchPersistentContext`) in Docker, possibly due to mismatched fingerprints or lack of genuine local state.
*   **The Working Solution:**
    1.  **Mount Real User Data:** You MUST mount the host's authenticated chrome profile (`~/.config/rsrch/user-data`).
    2.  **Direct Process Spawn:** Do NOT use Playwright's `launchServer` (ignores user-data) or `launchPersistentContext` (binds to pipe, hard to proxy). Spawn the `chrome` binary directly with `child_process`.
    3.  **Network Bypass:**
        *   Chrome rejects external connections to CDP (Host header check).
        *   **Fix:** Run `socat` inside the container: `socat TCP-LISTEN:9223,fork,reuseaddr,bind=0.0.0.0 TCP:127.0.0.1:9222`.
        *   **Client:** Resolve the container hostname to an IP address before connecting to bypass Chrome's IP whitelist check.

## Architecture Nuances
*   **`browser/server.js`** is now a custom supervisor script, not a standard Playwright entry point. It handles cleanup, `socat`, and process signals.
*   **`client.ts`** now has hybrid logic: simple WebSocket for local, but complex IP-resolution+HTTP-handshake for Docker CDP.

# B) Agent Behavior Patterns

## Diagnostics & Problem Solving
*   **Layered Verification:** The agent does not trust high-level success messages. It verifies:
    1.  **Container State:** `docker compose logs` & `ps`.
    2.  **Network State:** `netstat` or `curl` *inside* the container to confirm binding.
    3.  **Application State:** Grepping HTML source (e.g., checking for `<title>NotebookLM</title>` vs Google Login).
*   **"Samostatnost" (Autonomy):** When the profile was locked (`SingletonLock`), the agent automatically removed the lock files without asking. When `launchPersistentContext` failed networking, the agent architected a `socat` proxy solution independently.
*   **Code Preparation:** The agent writes "production-ready" snippets (handling `SIGINT`, `SIGTERM`, checking file existence) rather than quick ephemeral fixes.

## Response Structure
*   **Status Indicators:** Uses emojis (`🔴`, `🎉`) to draw attention to critical user actions (checking VNC) or success states.
*   **Result-First:** Answers "Did it work?" immediately, then explains "Why/How".

# C) User Request & Workflow Patterns

## How to Describe the User's Workflow
**"Visual-Feedback Loop with Integrity Constraints"**

*   **The "Eyes" Role:** The user acts as the visual sensor (VNC) for the blind agent. They provide ground-truth data that logs cannot (e.g., "It's the login page", "It's signed out").
*   **Description for LLM Prompting:**
    *   "I am a user who values **verification over assumption**. I will check your work visually via VNC/Screenshots."
    *   "I expect you to **admit ignorance** rather than hallucinate success. If a log is ambiguous, say so."
    *   "I drive the session by setting **hard architectural constraints** (must be Docker, must be persistent profile) and expect you to engineer around them."

## Patterns to Emulate
*   **Constraint Adherence:** If the user says "Docker", do not suggest "run locally" unless absolutely blocked. Solve the Docker problem (e.g., `socat`).
*   **Documentation:** The user treats the session as a "knowledge generation" event. Important findings must be serialized to markdown files for future context.
