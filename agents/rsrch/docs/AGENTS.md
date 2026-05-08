# Agent Integration Guide

This document describes how other agents (e.g., Jules, MapObsi) should interact with the `rsrch` service.

## 🏗️ Core Architecture & Protocols
For internal design decisions, forbidden patterns, and development protocols, see:
👉 **[DEVELOPMENT.md](./DEVELOPMENT.md)**

## 🤖 Interaction Modes

### 1. CLI Integration (Preferred for agents)
Most agents should use the `rsrch` CLI directly. 
- See [CLI_REFERENCE.qmd](./CLI_REFERENCE.qmd) for all commands.

### 2. HTTP API
For long-running or remote integrations, use the Express API.
- See [API_REFERENCE.qmd](./API_REFERENCE.qmd) for endpoint details.

### 3. Modular Actions
For low-level UI behavior customization or reuse in other projects, see `src/actions/`.
- **Gemini**: `src/actions/gemini/`
- **NotebookLM**: `src/actions/notebooklm/`
- **Shared**: `src/actions/common/`

### 4. Canvas / Artifacts
Programmable controls for Gemini's artifact system are exposed via `rsrch gemini canvas ...`.
- **History Management**: `versions`, `restore <id>`
- **Direct Modification**: `prompt <text>` (bypasses main chat flow)
- **Exporting**: `export [target]`

## 🤝 Jules Integration
1. **`jules-cli`**: List, get, status, retry.
2. **`jules-mcp`**: Create, approve, send_message.
3. **`browser_subagent`**: UI-only operations as a last resort.

> **Delegation guidelines:** See [@flows/autonomous-pm-framework.md](file:///home/sim/Obsi/Prods/01-pwf/flows/autonomous-pm-framework.md) for state mapping and monitoring patterns.

## ⚠️ Critical Note: Non-Blocking Ops
Agents interfacing with `rsrch` MUST respect the **Submit & Return** pattern. Do not block on results; use webhooks or polling of the `FalkorDB` / `jobs.json` state.

---
**Last Updated:** 2026-04-02
