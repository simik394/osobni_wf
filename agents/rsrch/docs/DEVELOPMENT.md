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
│  BROWSER SIDECAR (Parallel Capture)                            │
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
| **Stateless Actions** | Clients delegate UI logic to modular `Action` functions |

---

## 2. Browser Action Pattern (Stateless Handlers)

> [!TIP]
> **This is the preferred pattern for all new browser interactions.**

To prevent massive "God Object" clients, we decouple **Business Logic** from **UI Interaction**.

### 2.1 The Client (The Orchestrator)
Located in `src/clients/`.
- Maintains high-level state (Page instance, auth status).
- Delegates specific UI tasks to Actions.
- Returns clean technical/business data.

### 2.2 The Action (The Handler)
Located in `src/actions/`.
- **Stateless**: Does not store data between calls.
- **Signature**: `async function someAction(ctx: UniversalContext, deps: ActionDeps, ...args)`
- **Responsibility**: Selector-specific logic, clicking, scraping, waiting for stabilizers.

### 2.3 Benefits
- **Testability**: Actions can be tested in isolation with mocked `UniversalContext`.
- **Reusability**: Shared actions (like `uploadFilesAction`) can be used by multiple clients.
- **Stability**: Centralized error handling and screenshot-on-fail logic in the orchestrator.

---

## 3. Feature Development Lifecycle

### 3.1 Feature Proposal
Before implementation, document the feature in a **specification file**.
- **Location:** `docs/<feature_name>_spec.md`
- **When:** New cross-service functionality, major changes, or architectural decisions.

### 3.2 Specification Structure
Each spec must include: **Overview**, **Problem Statement**, **Goals**, **Technical Design**, **Operations**, **CLI/API**, **Integration Points**, and **WBS (Work Breakdown Structure)**.

### 3.3 WBS Guidelines
- **Phases:** Group related work (e.g., "Core Logic", "CLI", "Testing").
- **Granularity:** Each task should be completable in **1-3 tool calls**.
- **Checkboxes:** `[ ]` Not started, `[/]` In progress, `[x]` Complete.

---

## 4. Automation & Scraping Standards

### 4.1 The Golden Rule: Verify Before You Code
**Never guess a selector.** produce:
1.  **A Screenshot:** Verify visibility in headless/docker.
2.  **A DOM Dump:** Log attributes (`class`, `aria-label`, etc.).

### 4.2 Selector Strategy
- ❌ **Avoid:** Localized text, generic classes, position-based (`nth`).
- ✅ **Use:** Icon-based, specific container classes, Aria roles, stable parent-child hierarchy.

### 4.3 Interaction Reliability
- Always use `waitForSelector` or state confirmation before clicking.
- Set up event listeners (like `waitForEvent('download')`) **before** triggering the action.

---

## 5. Critical Agent Protocols

> [!CAUTION]
> ### 🚨 VERIFY BEFORE STATING AS FACT 🚨
> **NEVER state uncertain information as truth.** If unsure:
> 1. **STOP** 2. **VERIFY** (search_web, rsrch, etc.) 3. **STATE**

### 5.1 Research Escalation
`search_web` (quick) → `rsrch gemini query/deep-research` (comprehensive) → ask user (last resort).

### 5.2 Task Management (YouTrack)
- **All changes must be tracked.** Mentions YouTrack issue ID in commits.
- **Proof is Mandatory:** Every closed issue must have proof (screenshot, log, video).

### 5.3 Handoff & Continuity
- **Lessons Learned:** ALWAYS consult `LESSONS_LEARNED.md` at the start of a task. Update it after finishing.
- **Backup:** Ensure content is backed up before removing.

---

## 6. Testing Requirements

- **Unit/Integration Tests:** `tests/<feature_name>.test.ts`.
- **Repeatable:** Tests must be scripted, not manual.
- **Convention:** `npm run test` or `npx ts-node tests/<feature>.test.ts`.

---

## 7. Commit Guidelines

Example: `feat: implement <feature> phase N`

---

## 8. Living Documentation Standard

> "Documentation that doesn't run is just a lie waiting to happen."

We use **self-updating, executable documentation** via Quarto and Snippet markers.

### 8.1 The Snippet System
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

### 8.2 Maintenance
- **Single Source of Truth:** Code is truth. QMD extracts from it.
- **Commit QMD, not HTML:** HTML is a build artifact.

---

## 9. Split-Brain Architecture (CDP)

The `rsrch` system decouples **Execution Logic** (CLI/Windmill) from the **State Layer** (The Browser).

### 9.1 The Head (The Browser)
A persistent, long-running process (Docker or local) that holds session cookies and DOM state. Exposes **CDP** on port 9222.

### 9.2 The Brain (Logic)
Ephemeral CLI or Windmill worker that connects to the Head via WebSocket. It does NOT launch its own browser.

### 9.3 Usage (Local Development)
1. **Launch Chrome:** `google-chrome --remote-debugging-port=9222 --user-data-dir=./profile`
2. **Set Env:** `export BROWSER_CDP_ENDPOINT=http://localhost:9222`
3. **Run CLI:** `rsrch ...` (Attaches to your open browser).

---

## 10. BROWSER EFFICIENCY & RESOURCE MANAGEMENT

> [!IMPORTANT]
> **Resource leaks on `halvarm` are catastrophic.** Browser tabs must be managed explicitly.

### 10.1 Lease & Release Model
- **Acquisition**: Use `browserClient.getTabPage('service_name')` to lease a pooled tab.
- **Tracking**: `BrowserClient` tracks all leased pages.
- **Release**: Every high-level action (CLI, Worker) MUST call `await client.release()` in a `finally` block.
- **Pool Integrity**: Never close a pooled page manually; return it to the pool.

### 10.2 UI-Based Recycling
- ❌ **Forbidden**: Using `page.goto(HOME_URL)` or `page.reload()` to reset state.
- ✅ **Mandatory**: Use `await client.recycle()`.
- **Logic**: Clients must implement `recycle()` by clicking the logo or "Home" icons to preserve state/cache and avoid network overhead.

### 10.3 Smart Navigation
- Always check `page.url()` before calling `page.goto()`.
- If the browser is already at or near the target state, **skip navigation**.
- Example: `if (page.url().includes('gemini.google.com/app')) return;`

### 10.4 TabPool Enforcement
- Standalone utilities (`query.ts`, etc.) must use `BrowserClient` to acquire tabs.
- Avoid creating raw `browserContext` or `page` instances outside of the managed pool.
