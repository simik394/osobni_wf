# YouTrack Project Structure

This document defines the project structure in YouTrack for the `01-pwf` ecosystem. Use this reference to ensure tasks are filed in the correct project.

## Active Projects

| Key | Name | Description | Scope |
|-----|------|-------------|-------|
| **JULES** | Jules Agent | Development of the Jules agent, including `jules-go` CLI/Server and core logic. | Core Agent Logic, CLI, Server |
| **RSRCH** | Research Agent | Development of the Research agent (`rsrch`) and its capabilities. | Research Logic, Browser Automation, Knowledge Graph |
| **PROJ** | Personal Project Manager | Development of the Project Manager agent (`proj`). | Project Tracking, State Persistence, Context |
| **QUEST** | Quest Planner | Quest/Planning agent features. | Planning, Task Breakdown |
| **ANGRAV** | Antigravity Automation Agent | Tasks related to the Antigravity system itself. | Automation, Meta-Agents |
| **PERPX** | Perplexity Integration | Specific integration with Perplexity AI. | Perplexity API, Scraping |
| **YOUSIDIAN**| Yousidian Integration | Integration between YouTrack and Obsidian. | Sync logic, Deep links |
| **MAPOBSI** | Map Obsidian | Obsidian mapping tools. | Graph visualization, Exporters |
| **DOWNLOADER**| Smart Downloader | Downloader utilities. | Media downloading, Archiving |
| **TOOLS** | MyTOOLs | **Legacy/General Tooling**. Originally the catch-all project. | **DEPRECATED for specific agents**. Use only for shared infra/general tools not covered above. |

## Other Projects (Contextual)
- **SAM**, **SS** (Smart System), **SKOLA** (School), **SKAUT** (Scout), **DOMA** (Home), **napoveda69_online**, **GWRKSPC** (Google Workspace).

## Configuration as Code (IaC)
All projects, fields, and workflows are defined declaratively in the repository:
`infrastruct/configs/youtrack.conf/`

**Key Principles**:
1.  **Not Hardlocked**: You are not restricted by the current project settings. If you need a new State, Field, or Workflow rule, you can modify it in the code.
2.  **Workflow as JS**: Workflows are written in JavaScript in `workflows/` and attached via `project.yaml`.
3.  **Self-Evolution**: Agents (and devs) should propose changes to this configuration when implementing features that require process changes (e.g., Auto-Close workflows).

See [infrastruct/configs/youtrack.conf/README.md](file:///home/sim/Obsi/Prods/01-pwf/infrastruct/configs/youtrack.conf/README.md) for usage.

## Data Integrity / Duplicates Report (2026-01-20)

A review of the `TOOLS` project revealed that newer tasks for specific agents have been inadvertently created in `TOOLS` instead of their dedicated projects.

### PROJ Agent
The contents of `TOOLS-125` through `TOOLS-130` (created Jan 11) appear to be PROJ-specific tasks.
- **TOOLS-125**: FalkorDB state persistence (Likely matches PROJ-4/PROJ-5 scope)
- **TOOLS-126**: LLM-powered intent detection
- **TOOLS-127**: FastAPI server
- **TOOLS-128**: Context restoration
- **TOOLS-129**: Energy matching
- **TOOLS-130**: rsrch linking

These should be tracked in **PROJ**.

### Jules Agent
Recent `jules-go` tasks (`TOOLS-139` to `TOOLS-144`) were created in `TOOLS`.
- **TOOLS-139**: Session state summary
- **TOOLS-140**: Async bulk publish
- **TOOLS-141**: YouTrack sync
- **TOOLS-142**: PR dashboard
...

**Action Item**: Future Jules-related tooling tasks should be filed in **JULES**. Existing `TOOLS-xxx` tickets will be completed as-is to preserve ID continuity in current session logs, but should be migrated or treated as JULES tasks logically.
