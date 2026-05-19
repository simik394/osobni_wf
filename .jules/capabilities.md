# Agentic Capabilities: YouTrack SDK

This repository includes an **Agentic SDK** that allows you to autonomously interact with YouTrack for task management and progress reporting.

## 🛠️ Setup
Before using the SDK, you must bootstrap your environment:
```bash
source agents/sdk/bootstrap.sh
```

## 📋 Available Commands (`yt`)

Use these commands to manage your workflow:

### 1. Identify Work
- `yt list -p <PROJECT_KEY>`: List unresolved issues in a project.
- `yt get <ISSUE_ID>`: Get full details (summary, description, state) of a specific issue.

### 2. Report Progress
- `yt comment <ISSUE_ID> "<message>"`: Post a progress update. 
  **Requirement**: Report progress at the start, after major milestones, and at the end of your session.

### 3. Log New Issues
- `yt create -p <PROJECT_KEY> -s "<summary>" -d "<description>"`: Create a new issue if you find a bug or need a follow-up task.

## 🛡️ Nim Design Critique (Lean 4 Opponent)
You have Lean 4 installed in your VM to act as a formal opponent for your Nim designs. Use it to verify logical consistency of types, state machines, or complex algorithms.

### Workflow:
1. **Model**: Create a `.lean` file representing the formal model of your Nim design.
2. **Verify & Report**: Run `yt report-lean <ISSUE_ID> <FILE.lean>`.
3. **Requirement**: At the start of a session, you MUST verify Lean 4 functionality by reporting a simple "Hello World" proof to YouTrack (e.g., to issue `JULES-12`) before proceeding with complex Nim tasks.

## 🌉 The Bridge
This tool uses a file-signaling bridge. When you run a command, it waits for the host to fulfill it. Be patient if calls take a few seconds.

---
**Current Projects**: `TOOLS`, `RSRCH`, `JULES`, `QUEST`, `ANGRAV`, `PROJ`, etc.
