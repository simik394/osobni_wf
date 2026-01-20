# Technical Proposals: PM Orchestration Features (2026-01)

## 1. Fast Session Review (`jules diff`)

**Target Issue**: New Issue (e.g., `TOOLS-NEW`)
**Type**: Feature
**Summary**: `jules-go: fast session review command (diff)`

### Problem
Reviewing sessions currently requires `jules remote pull`, which involves git operations, branch switching, and file system changes. This is too slow for "Quick Look" reviews.

### Proposal
Implement `jules diff <session-id>` to display changes without local checkout.

#### Implementation Details
- **Command**: `jules-cli diff [session-id] [--color]`
- **Mechanism**:
    1.  **Windmill Strategy** (Primary):
        - **Script**: `f/jules/get_session_diff`.
        - **Inputs**: `session_id`, `git_repo_url`, `base_branch` (default: main).
        - **Action**:
            - Clone the repository (shallow/partial) in the Windmill worker.
            - Execute `jules remote pull` to fetch session changes.
            - Run `git diff origin/main...HEAD` (or relevant comparison).
            - Return the diff text.
        - **Client**: `jules-cli` receives the raw diff string and applies **syntax highlighting** (using a library like `chroma`) before printing to the terminal, ensuring a colorful and readable output (`git diff`-like experience).
    2.  **Fallback**: Local wrapper strategy (if Windmill is unreachable).

#### CLI Usage
```bash
$ jules diff 12345
# Triggers Windmill job...
diff --git a/main.go b/main.go
...
```

---

## 2. Delegation Automation (`jules delegate`)

**Target Issue**: New Issue (e.g., `TOOLS-NEW`)
**Type**: Feature
**Summary**: `jules-go: automatic session creation from YouTrack (delegate)`

### Problem
Delegating work to Jules requires manual prompt curation.

### Proposal
Implement `jules delegate` via Windmill to automate the flow.

#### Implementation Details
- **Command**: `jules delegate <issue-id> [--project=PROJECT]`
- **Mechanism**:
    1.  **Script**: `f/jules/delegate_task_from_youtrack`.
    2.  **Inputs**: `issue_id`, `project_key` (optional override).
    3.  **Action**:
        - Fetch YouTrack Issue details.
        - Generate Prompt using LLM (via `f/rsrch/generate_prompt` or internal logic).
        - Create Jules Session (`POST /sessions`).
        - Post Comment on YouTrack with Session Link.
        - Update Issue State.

---

## 3. Feedback Loop (Auto-Close)

**Target Issue**: [JULES-7](https://napoveda.youtrack.cloud/issue/JULES-7) (Full GitHub/YouTrack Dual-Sync)

### Problem
Issues remain "In Progress" after PR merge.

### Proposal
Implement a Windmill Webhook to handle GitHub events.

#### Implementation Details
- **Trigger**: GitHub Webhook -> Windmill Webhook (`f/jules/github_webhook`).
- **Logic**:
    1.  Receive `pull_request.closed` event (merged=true).
    2.  Parse PR Body for "Fixes/Closes <ID>".
    3.  **Update Checkboxes**:
        - Fetch Issue Description.
        - Regex replace `- [ ]` with `- [x]` for lines matching context (or generic "Merge" tasks).
        - Push updated description.
        - **Constraints**: Configure YouTrack Project Workflow to strictly limit this transition to the "Jules/Automation" user.
        - **Implementation**: Define this workflow rule in `infrastruct/configs/youtrack.conf/projects/JULES` using the existing IaC framework.
            - create `workflows/safe-merge.js`.
            - update `project.yaml` to attach it.
        - This avoids manual admin UI configuration and follows GitOps practices.

---

## 4. Environment as Code (`jules env`)

**Target Issue**: New Issue (e.g., `TOOLS-NEW`)
**Type**: Feature
**Summary**: `jules-go: declarative environment management (IaC)`

### Problem
Jules environments (setup scripts, env vars) are currently managed via ClickOps in the Web GUI. There is no CLI or file-based import.

### Proposal
Implement `jules env push` to sync a local YAML definition to the Jules GUI via Windmill.

#### Implementation Details
- **Config File**: `jules.yaml` (in repo root)
    ```yaml
    environment:
      setup_script: |
        npm install
        go mod download
      env_vars:
        API_KEY: "secret:hashicorp/data/api"
      network_access: true
    ```
- **Mechanism**:
    1.  **Script**: `f/jules/update_repo_env`.
    2.  **Action**:
        - Windmill worker (browser) navigates to `https://jules.google.com/repo/{repo}/config`.
        - Pastes the `setup_script` into the text area.
        - Updates Environment Variables table.
        - Clicks "Save" / "Run and snapshot".
- **Benefit**: Fully reproducible environments defined in code.
