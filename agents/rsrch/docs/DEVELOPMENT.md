# Development & Automation Guide

> This document is the single source of truth for how to propose, specify, and implement features in the `rsrch` project.

---

## 🏗️ PRODUCTION ARCHITECTURE

> [!IMPORTANT]
> **This is the core architecture. All code must follow this pattern.**

```
┌────────────────────────────────────────────────────────────────┐
│  WINDMILL (Sequential Execution)                               │
│                                                                │
│  Request 1 → submit.ts → Tab1: submit query → RETURN           │
│  Request 2 → submit.ts → Tab2: submit query → RETURN           │
│  Request 3 → submit.ts → Tab3: submit query → RETURN           │
│                                                                │
│  Windmill workers execute SEQUENTIALLY to avoid race           │
│  conditions when acquiring tabs from the pool.                 │
└────────────────────────────────────────────────────────────────┘
                         ↓
┌────────────────────────────────────────────────────────────────┐
│  BROWSER SINGLETON (Parallel Capture)                          │
│  MAX_TABS = 5                                                  │
│                                                                │
│  Tab1: [MutationObserver waiting for LLM response...]          │
│  Tab2: [MutationObserver waiting for LLM response...]          │
│  Tab3: [MutationObserver waiting for LLM response...]          │
│                                                                │
│  All tabs capture responses IN PARALLEL via Node event loop.   │
│  Browser sits idle while LLMs generate (15-30s per response).  │
└────────────────────────────────────────────────────────────────┘
```

### Key Patterns
| Pattern | Description |
|---------|-------------|
| **Submit & Return** | Windmill script submits query, sets up observer, returns **immediately** |
| **Passive Watcher** | `MutationObserver` on DOM - **NO blocking `await`** |
| **Tab Persistence** | Tabs **MUST NOT** reload during active monitoring |
| **Interleaved Parallelism** | Event loop handles multiple responses simultaneously |

---

## 1. Feature Development Lifecycle

### 1.1 Feature Proposal
Before implementation, document the feature in a **specification file**.
- **Location:** `docs/<feature_name>_spec.md`
- **When:** New cross-service functionality, major changes, or architectural decisions.

### 1.2 Specification Structure
Each spec must include: **Overview**, **Problem Statement**, **Goals**, **Technical Design**, **Operations**, **CLI/API**, **Integration Points**, and **WBS (Work Breakdown Structure)**.

### 1.3 WBS Guidelines
- **Phases:** Group related work (e.g., "Core Logic", "CLI", "Testing").
- **Granularity:** Each task should be completable in **1-3 tool calls**.
- **Checkboxes:** `[ ]` Not started, `[/]` In progress, `[x]` Complete.

---

## 2. Automation & Scraping Standards

### 2.1 The Golden Rule: Verify Before You Code
**Never guess a selector.** produce:
1.  **A Screenshot:** Verify visibility in headless/docker.
2.  **A DOM Dump:** Log attributes (`class`, `aria-label`, etc.).

### 2.2 Selector Strategy
- ❌ **Avoid:** Localized text, generic classes, position-based (`nth`).
- ✅ **Use:** Icon-based, specific container classes, Aria roles, stable parent-child hierarchy.

### 2.3 Interaction Reliability
- Always use `waitForSelector` or state confirmation before clicking.
- Set up event listeners (like `waitForEvent('download')`) **before** triggering the action.

---

## 3. Critical Agent Protocols

> [!CAUTION]
> ### 🚨 VERIFY BEFORE STATING AS FACT 🚨
> **NEVER state uncertain information as truth.** If unsure:
> 1. **STOP** 2. **VERIFY** (search_web, rsrch, etc.) 3. **STATE**

### 3.1 Research Escalation
`search_web` (quick) → `rsrch gemini query/deep-research` (comprehensive) → ask user (last resort).

### 3.2 Task Management (YouTrack)
- **All changes must be tracked.** Mentions YouTrack issue ID in commits.
- **Proof is Mandatory:** Every closed issue must have proof (screenshot, log, video).

### 3.3 Handoff & Continuity
- **Lessons Learned:** ALWAYS consult `LESSONS_LEARNED.md` at the start of a task. Update it after finishing.
- **Backup:** Ensure content is backed up before removing.

---

## 4. Testing Requirements

- **Unit/Integration Tests:** `tests/<feature_name>.test.ts`.
- **Repeatable:** Tests must be scripted, not manual.
- **Convention:** `npm run test` or `npx ts-node tests/<feature>.test.ts`.

---

## 5. Commit Guidelines
...
Example: `feat: implement <feature> phase N`

---

## 6. Living Documentation Standard

> "Documentation that doesn't run is just a lie waiting to happen."

We use **self-updating, executable documentation** via Quarto and Snippet markers.

### 6.1 The Snippet System
Instead of copy-pasting code, mark regions in source files:
```typescript
// start snippet <unique-name>
...
// end snippet <unique-name>
```
Reference them in `.qmd` files:
```qmd
```{.typescript include="src/file.ts" snippet="unique-name"}
```
```

### 6.2 Maintenance
- **Single Source of Truth:** Code is truth. QMD extracts from it.
...
- **Commit QMD, not HTML:** HTML is a build artifact.

---

## 7. Split-Brain Architecture (CDP)

The `rsrch` system decouples **Execution Logic** (CLI/Windmill) from the **State Layer** (The Browser).

### 7.1 The Head (The Browser)
A persistent, long-running process (Docker or local) that holds session cookies and DOM state. Exposes **CDP** on port 9222.

### 7.2 The Brain (Logic)
Ephemeral CLI or Windmill worker that connects to the Head via WebSocket. It does NOT launch its own browser.

### 7.3 Usage (Local Development)
1. **Launch Chrome:** `google-chrome --remote-debugging-port=9222 --user-data-dir=./profile`
2. **Set Env:** `export BROWSER_CDP_ENDPOINT=http://localhost:9222`
3. **Run CLI:** `rsrch ...` (Attaches to your open browser).
