# Feature Proposal: Jule Agent Integration

## Overview

This proposal outlines the creation of "Jule," a specialized automation agent designed to interact with the Google Jules web interface (`jules.google.com`). Jule will integrate into the existing `rsrch` infrastructure, leveraging the established "stealth" browser capabilities (Dockerized Chromium, human emulation) while maintaining a distinct identity and semantic separation.

## Architecture

*   **Infrastructure:** Reuses the existing `rsrch` Dockerized Chromium stack.
*   **Isolation:** Runs as a separate logical agent.
*   **Identity:** Uses a dedicated, anonymized Google account, separate from other agents.
*   **Persistence:**
    *   **Strategy:** Mounts a dedicated local directory to the Docker container's `/user-data` (or equivalent).
    *   **Authentication:** Relies on an initial *manual* login performed locally to establish the session cookies and tokens within the persistent directory. This avoids the complexity and risk of automated login scripts.

## Core Capabilities

1.  **Session Management:**
    *   Ability to attach to existing Jules sessions via URL.
    *   Ability to create new sessions if required (though primarily focused on managing active workflows).
2.  **Continuous Interaction:**
    *   Monitor chat status (polling loop with random intervals).
    *   Detect "COMPLETED" or "FAILED" states.
    *   Send follow-up prompts/instructions into the chat.
    *   **Critical:** Automate the "Publish Branch" action upon task completion.
3.  **Stealth / Human Emulation:**
    *   Inherits `rsrch` stealth features (randomized delays, non-linear mouse movements, valid browser fingerprinting).
    *   Operates in a "headed" mode (via Xvfb in Docker) to pass visual rendering checks.
4.  **Interface:**
    *   Exposes a CLI and/or REST API for control (compatible with existing orchestrators).
    *   Emits notifications (webhooks or local system) on key events (Task Finished, Input Needed).

## Implementation Plan

1.  **Environment Setup:**
    *   Define the persistent storage path: `.../agents/jule/profile`.
    *   Create the Docker Compose service definition (inheriting from `rsrch` base).
2.  **Playwright Logic:**
    *   Develop the specific selectors and interaction logic for the `jules.google.com` DOM.
    *   Implement the "Publish Branch" clicker.
3.  **Integration:**
    *   Connect to the central notification system.
    *   Register Jule as an available tool/agent in the main CLI.

## Security & Risk

*   **ToS Compliance:** Acknowledged risk of automated interaction. Mitigation relies on the high-fidelity human emulation provided by the `rsrch` stack.
*   **Credential Safety:** Credentials are never stored in code/env vars; they exist only as session tokens in the securely mounted volume.
