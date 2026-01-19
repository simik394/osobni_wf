# Lessons Learned: Project 01-pwf (Updated)

## User Preferences (Critical)

### Don't Ask Obvious Questions (2026-01-11)
- **Never ask for confirmation on obvious next steps** - just do it
- **Preface actions with `Assumptions:` header** to make reasoning transparent
- Only ask in: highly debatable, unknown, or high-stakes situations
- Example bad: "Want me to test this?" → Just test it
- Example good: "**Assumptions:** New key needs testing. Testing now..."

### Jules API: startingBranch Required (2026-01-11)
- **GitHub sources require `githubRepoContext.startingBranch`** field
- Without it: API returns `400 INVALID_ARGUMENT`
- Correct format:
```json
{
  "prompt": "task",
  "sourceContext": {
    "source": "sources/github/owner/repo",
    "githubRepoContext": {"startingBranch": "main"}
  }
}
```

## AI-Generated Code Placeholders (2026-01-16)
- **Always verify "full" files provided by AI assistants.** They may contain comments like `// rest of the file remains the same` but actually omit critical methods, leading to broken builds/types.
- **Verification Priority:** Always verify server compilation (`npm run build` or equivalent) locally BEFORE concluding a refactor that involves core data access layers.

## Parameter Alignment in Refactoring (2026-01-16)
- **Align internal callers with new signatures.** When refactoring shared logic (e.g. Puppeteer -> Playwright), ensure all internal callers (like `server.ts` or `windmill` scripts) are updated to match the new method signatures and parameter names (e.g. `docId` vs `researchDocId`).

## Agentic Best Practices (Meta-learning)
- **Metadata first**: Always check `ADDITIONAL_METADATA` (like Browser State) before launching expensive/slow tools like `browser_subagent`. If the user already has the relevant page open, the data is likely right there.
- **CLI vs GUI**: If the task is primarily about automation and CLI (Ansible), prioritize tools that align with that workflow. Avoid "GUI overkill" for simple information retrieval when more direct methods are available.
- **Context over Research**: Sometimes the best "research" is simply reading the current state provided by the user (open files, cursor position, active tabs) instead of starting a fresh search.
- **Documentation Hygiene**: Always keep `pwf.TODO.md` updated to provide a clear history of achievement.

## Infrastructure & Automation (Ansible)
- **Escalation**: When running Ansible playbooks requiring `become: true` locally, use `--ask-become-pass` if passwordless sudo is not configured.
- **PPA Management**: Use `apt_repository` for clean external repository management on Ubuntu/Pop!_OS.
- **Interactive Prompts**: Background commands struggle with interactive prompts. Inform the user if they need to handle a sudo password or similar in their terminal.
- **Plugin Management**: While manual installation to `~/.config` is faster for one-off tests, integrating into Ansible roles (using `get_url` and `unarchive`) ensures consistency across reinstalls.
- **System Paths (OBS)**: For `apt`-installed OBS, plugins should be placed in `/usr/lib/x86_64-linux-gnu/obs-plugins/` for global availability.
- **User-Directory Plugins**: For per-user installation (avoiding sudo), use `~/.config/obs-studio/plugins/<plugin-name>/bin/64bit/` and `.../data/`. This works with both native and Flatpak OBS.
- **Nested Archives**: Some plugin releases contain a `.tar.gz` inside a `.zip`. Always inspect the archive structure before automating extraction. Use Ansible's `find` module to locate inner archives dynamically.
- **OBS Multi-Source Recording**: When using Source Record plugin, configure the main output as a "dummy" (16×16 resolution, 100kbps) to minimize disk usage while recording full-quality per-source videos. See [[OBS_BEST_PRACTICES]].
- **AppImage Lifecycle Management**: When automating AppImage updates via Ansible, always implement an explicit cleanup task for old versions. Unlike package managers, AppImage downloads are just files; leaving old ones leads to disk bloat and potential user confusion where "cached" launchers or taskbar pins point to the old executable.
- **Zombie Process Conflicts**: Applications like LM Studio use background workers (e.g., node, llmworker). Closing the main window may not kill these. When updating, use `pkill -f` to ensure the old version's mounts (`/tmp/.mount_LM-*`) are cleared, otherwise re-launching may reconnect to the old session.
- **Dynamic Version Scrapping**: When official download URLs don't have a stable `/latest` redirect, a dedicated Python/Shell script is superior to complex regex inside Ansible tasks. It allows for robust error handling and complex parsing (like extracting build numbers from Next.js hydration data).
- **Input Leap Cross-Platform KVM**: When sharing mouse/keyboard between Linux and Windows via Input Leap, set `relativeMouseMoves = true` in the server config. Without this, the cursor may be invisible on Windows. Also note: the client's screen name must match its actual hostname (e.g., `win22h2-simik` not an alias like `wtw.a`).

## Software Architecture & Performance
- **Architecture > Language**: Design decisions (e.g., parallelization, connection pooling) often have a much larger impact on performance than the choice of programming language itself.
- **Intermediate Formats ("Dump Mode")**: For bulk data ingestion, prefer generating a compatible "load file" (like `.cypher` for Redis/FalkorDB) to bypass network latency and RPC overhead.
- **Ecosystem Maturity**: When reliability is key, the maturity and stability of a language's ecosystem (drivers, libraries) usually outweigh theoretical performance benefits.
- **Struct Schema Matching**: Always validate configuration structure against schema; silent failures in decoders (like YAML/JSON) can lead to zero-valued fields that are hard to debug.
- **Domain Separation**: Grouping configuration by domain (e.g., I/O vs. Processing logic) makes the system more maintainable and easier to extend without breaking core loops.

## Logic Programming Tool Selection
When choosing between SWI-Prolog and ELPI (λProlog):
- **Use SWI-Prolog** for: flat database queries, HTTP/JSON integration, constraint logic programming, rapid REPL prototyping.
- **Use ELPI** for: data with lambdas/binders (AST manipulation), local hypothetical reasoning without side-effects, meta-programming over rules.
- **Decision heuristic**: If your data has "holes" (variables that can be bound) or you need `(assume X => prove Y)` style reasoning, consider ELPI. Otherwise, start with SWI-Prolog.

## Web Automation API Patterns
When wrapping browser automation as OpenAI-compatible API:
- **DOM Polling for SSE**: Poll the DOM every 300-500ms to extract partial responses while AI is generating. Send deltas (new text since last poll) as SSE chunks.
- **Stability Detection**: Consider response complete when DOM content is stable for 2-3 consecutive polls (response stabilized).
- **Sequential Processing**: NEVER run parallel interactions in multiple browser tabs - dead giveaway for bot detection. Use request queue for sequential processing.
- **Human-like Behavior**: Paste whole prompts is fine (humans do this), but avoid superhuman interaction patterns like split-second multi-tab switches.
- **Error via SSE**: When streaming fails, send error as final SSE chunk with `finish_reason: 'stop'` rather than throwing, to avoid unhandled rejections.
- **Model Routing**: Use OpenAI `model` field to route requests to different backends (e.g., `gemini-rsrch` → Gemini, `perplexity` → Perplexity.ai).
- **Session via Request Body**: Extend OpenAI API with `session` field in request body for conversation continuity. Echo session in response. Use `session: "new"` to start fresh conversation.

## Visualization & Rendering (Phase 4 Refinements)
- **Rendering at Scale**: For large codebases, Mermaid's auto-rendering can lead to unreadable PNGs or high node density. Providing PlantUML as a fallback solves this, as it handles complex layouts more gracefully.
- **Experimental Online Rendering**: When local installations (Java/PlantUML) are unavailable due to environment restrictions (e.g., sudo required), providing a direct PUML source and an online renderer link is a robust interoperability strategy.
- **Syntax Sensitivity**: Mermaid syntax is brittle; triple braces `{{{ }}}` are invalid for hexagons. Prefer `(( ))` for circular nodes or explicit `{{ }}` for hexagons when conflicts with template engines aren't an issue.

## Multi-Diagram Strategy (Phase 5 Refinements)
- **Diagram Splitting**: For high-density reports, splitting Mermaid into "Structure" (DEFINES) and "Dependencies" (IMPORTS) dramatically improves scannability and prevents rendering timeouts.
- **Multi-Block PlantUML**: PlantUML supports multiple `@startuml ... @enduml` blocks in a single `.puml` file. This is an efficient way to provide Architecture, Package, and Class views without cluttering the filesystem.
- **Client-Side Rendering**: For interactive reports without server dependencies, simple embedding of libraries like `mermaid.js` is superior to static generation or remote calls. It bypasses URL limits, rendering timeouts, and requires zero user configuration.
- **Robust Web Rendering**: If server-side rendering is strictly needed (e.g. for PlantUML specific features), usage of encoded GET requests with a "Copy Source" fallback is more reliable than POST forms due to CORS/API limitations on public servers.

## Cluster-Based Diagramming (Architecture Mapping)
- **Relative Path Disambiguation**: When clustering by directory, avoid using just the `basename` (e.g., `browser`). Using the relative path from the scan scope (e.g., `rsrch/browser`) prevents name collisions and diagram merging in multi-module projects.
- **Frontier Node Inclusion**: A diagram for a single cluster is too isolated if it doesn't show external dependencies. Including "Frontier Nodes" (1-hop external connections) provides crucial architecture context without the noise of the full graph.
- **Semantic Path Filtering**: Architecture diagrams should be restricted to high-value nodes (e.g., `:Code` vs `:Note` or metadata). This keeps technical views focused on structural intent rather than general knowledge-graph noise.
- **Client-Side Scalability**: Prioritize client-side rendering (Mermaid.js via CDN) for HTML reports. It removes dependencies on local Java installations or remote rendering APIs, simplifies report distribution, and avoids URL length limits for complex graphs.


## Agent State Management (FalkorDB Integration)
- **Session Resolution Ambiguity**: Agents like `rsrch` may use human-readable session names, while `angrav` uses UUIDs.
    - *Fix*: Implemented `findSession(nameOrId)` in the shared client. It attempts an exact UUID match first, then falls back to a fuzzy query for the most recent session with that Name.
- **Deeply Nested Result Parsing**: FalkorDB's Redis response format often wraps results in multiple array layers (e.g., `[[[[key, val]]]]`) which standard parsers miss.
    - *Fix*: Recursive `parseResult` helper is mandatory for robust data extraction.

## Tool Tracking & Middleware
- **The "Black Box" Problem**: We cannot wrap/middleware tools executed inside a closed-source or UI-driven application (like the Antigravity web UI) because we don't control the function calls.
    - *Fix*: **UI Observer Pattern**. Instead of intercepting the cause (function call), we scrape the effect (UI message "Writing file...") from the DOM.
- **The "White Box" Solution**: For agents we run locally (like `rsrch`), standard **Code Middleware** (wrapping the tool function) is superior as it captures intent with zero latency.

## Infrastructure Redundancy
- **Don't Reinvent Service Discovery**: Building a heartbeat system in FalkorDB was redundant when Nomad+Consul already exhaustively track service health.
    - *Fix*: **Consul Sync Adapter**. Use Consul as the Source of Truth for *now*. Sync to FalkorDB only for *historical context/audit*.

## Anti-Patterns & Points of Struggle
- **Reinventing the Wheel (Context Blindness)**: I spent significant time designing a custom 'Service Registry' for FalkorDB, completely ignoring that the user's stack (Nomad/Consul) already solves this. *Lesson:* Always audit the existing infrastructure capabilities *before* proposing new state management components. 
- **Code Debugging vs. Arch Defects**: I wasted cycles adding debug logs to `logInteraction` to fix a "missing session" bug. The code was fine; the architecture was flawed (One agent used Names, the other UUIDs). *Lesson:* When an integration fails silently, verify the *data contract* (ID format) before debugging the *code logic*.
- **The "White Box" Fallacy**: I initially proposed "Tool Middleware" for Angrav, assuming we could wrap its function calls. I failed to realize Angrav is a "UI Driver" (Black Box) until late in the planning. *Lesson:* Explicitly categorize agents as "Code Executors" (Middleware possible) vs "UI Drivers" (Scrapers only) at the start of design.

## Playwright & Browser Automation
- **Text-Pattern Matching for Dynamic UIs**: When DOM classes are unstable (e.g. Tailwind classes changing or being generic), rely on robust Regex matching against `textContent` to identify item types (like "Edited file.ts" or tool outputs) rather than fragile CSS selectors.
- **Markdown Output**: For knowledge management systems (like Obsidian), generating Markdown output directly from the scraper is vastly more useful than plain text. It allows for rich formatting (syntax highlighting, alerts) that improves readability.
- **Limit Option for Testing**: Always implement a `--limit` or `--dry-run` option early in scraper development to allow fast feedback loops without waiting for full history processing.
- **Stealth Plugin Dependencies**: `puppeteer-extra-plugin-stealth` can fail with "dependency not found (stealth/evasions/chrome.app)" in some persistent environments or when bundled. If this blocks execution, disabling the plugin is a valid temporary workaround for local tools, provided you don't aggressively scrape.
- **Binary vs Source Execution**: When debugging CLI tools (like `rsrch`), always verify if the global command is an alias to a stale binary (`pkg` snapshot) or the actual local code. Prefer running `node dist/index.js` or `ts-node src/index.ts` directly during development to ensure you are testing the latest changes.

## Browser Subagent Best Practices (2026-01-10)

> [!IMPORTANT]
> **Tool Precedence: `jules-cli` FIRST, `browser_subagent` as TEMPORARY FALLBACK**
> 
> - Use `jules-cli` for: list, get, status, retry (fast, no memory overhead)
> - Use `jules-mcp` for: create, approve, send_message, wait_for_completion (reliable, programmatic)
> - Use `browser_subagent` ONLY as LAST RESORT for capabilities missing in both CLI and MCP (e.g., publishing PRs if not in MCP yet)
> - See: `agents/jules-go/README.md` and `flows/autonomous-pm-framework.md` section 2.2-2.3

> [!TIP]
> **When using browser_subagent, delegate decision-making to the subagent itself - don't prescribe responses.**

### Anti-Pattern: Mindless "Yes, proceed"
When Jules asks a question or presents options, the browser_subagent must:
1. **Read the actual question** - What is Jules asking?
2. **Analyze the context** - What are the options? What are the trade-offs?
3. **Provide appropriate response** - Answer the question, pick the better option, or request clarification if unclear

### Correct Subagent Prompting

❌ **WRONG: Prescribing the response**
```
Go to the session. If Jules asks anything, say "Yes, proceed".
```

✅ **CORRECT: Delegate decision-making to subagent**
```
Go to the session and analyze Jules' current state.

Read what Jules is asking or presenting, then decide the appropriate response:
- If presenting options: Evaluate trade-offs and pick the better option
- If asking technical question: Provide specific guidance based on context
- If blocked on environment issue: Suggest workaround if obvious, otherwise escalate
- If unclear what's needed: Request clarification from Jules

Make your own judgment about the best response. Return:
1. What Jules was asking
2. What response you provided and why
3. Whether user should be notified for review
```

### Session State Refresh Issue
Jules sessions sometimes show stale state. If the UI shows "Session is inactive - chat to resume" but seems frozen:
- Reload the page before taking action
- Previous responses may have registered but UI didn't update

### When to Escalate to User
- Architectural decisions (which approach to use)
- Breaking changes or risky operations
- Unclear requirements that need human judgment
- Anything that could affect data integrity

### Timeout Rule: 20 Second Maximum
> [!WARNING]
> **Browser subagent operations should NOT wait more than 20 seconds.**
> 
> If an operation is taking longer (page loading, Jules thinking, etc.):
> 1. Return with current status and a handle for later follow-up
> 2. Continue with other unblocked tasks
> 3. Check back on the slow operation later
> 
> **Never block the entire workflow waiting for a slow browser operation.**

## Infrastructure & Remote Browsers
- **Host Networking & Zombies**: Running Docker containers with `network_mode: "host"` binds process ports directly to the host interface. If the container or entrypoint crashes (e.g. `socat`), the process may become a zombie or stay detached, holding the port and preventing restart. ALWAYS automate cleanup (e.g., `killall socat`, `docker rm -f`) in restart scripts or playbooks.
- **Port Conflict Management**: When running multiple browser instances (e.g. `rsrch` + `angrav`), strictly assign distinct ports for VNC and CDP. Relying on "random selection" or defaults (5900, 9222) guarantees collisions.
- **Sidecar Availability**: `socat` sidecars for port forwarding are brittle if the target (Chrome) isn't ready. Use a wait loop (poll port) or a dedicated startup script that sequences the browser launch before the proxy.
- **ARM64 Compatibility**: Standard Selenium images often lack ARM64 support or are unoptimized. Use `seleniarm/standalone-chromium` for reliability on `aarch64` servers (like OCI Ampere A1).
- **Docker Build Context**: When building images on a remote server, simple `scp` of the source directory is often faster and more reliable than configuring remote Docker contexts, especially for ad-hoc builds.
- **Private Submodules in CI**: GitHub Actions cannot access private submodules using the default `GITHUB_TOKEN`. Either make the submodule public, or configure SSH deploy keys with the `webfactory/ssh-agent` action and add the key as a deploy key to the submodule repo.

## Documentation & Project Hygiene
- **Consolidated Entry Points**: Avoid scattering documentation across multiple READMEs without a clear entry point. Create a single "Getting Started" guide that links to detailed docs.
- **TODO.md for Roadmaps**: Maintaining a `TODO.md` at project root (separate from implementation code) provides a clear, living roadmap that helps agents and developers track progress.
- **Test-First Priority**: For production-ready code with zero tests, prioritize test creation immediately. Start with the core parsing/config modules as they validate the fundamental correctness.
- **Go Testing Helpers**: Use `t.TempDir()` for automatic cleanup of temp files in Go tests. It's cleaner than manual `defer os.Remove()` patterns.

## Electron & CDP Debugging
- **Window Visibility**: Electron apps expose multiple renderer processes, but only windows created *before* `--remote-debugging-port` is registered appear on CDP. If you open a new window after launch, it won't be visible on port 9222. *Fix*: Restart the app so your main window is the first one created.
- **Zombie Renderers**: CDP may report a page target that's actually a crashed/frozen renderer (empty DOM, blank HTML). Always verify with a screenshot or DOM dump before assuming the window is functional.
- **DOM Structure Changes**: UI frameworks frequently change their DOM structure between versions. Hard-coded selectors like `span[data-lexical-text="true"]` will break. *Fix*: Use broader selectors (`#cascade`, `.prose`) and heuristic classification rather than brittle attribute selectors.
- **iframes and Webviews**: In Electron apps, the main content often lives in an iframe (like `cascade-panel.html`). Use `page.frames().find(f => f.url().includes('target.html'))` to locate it, not `page.mainFrame()`.
- **Popover Confusion**: CSS class selectors like `div.bg-ide-chat-background` may match hidden popovers/dialogs rather than the actual content. Always filter by `role !== 'dialog'` or verify visibility.
- **Virtualized Lists & Scrolling**: React-style virtualized lists often "snap" scroll positions when scrolling forward, re-rendering entire sections and jumping to unexpected positions. *Fix*: Scroll BACKWARDS from the bottom instead - virtualized UIs handle precise upward scrolling better because they're optimized for "load more" at the top. Use `scrollTop = targetPosition` with explicit targets rather than incremental `scrollTop += offset`.

## Web Scraping: Virtualized UIs & Collapsed Content
- **Expansion Before Extraction**: In virtualized lists (like React-Window), content inside collapsed sections often isn't even in the DOM until expanded. You MUST expand these sections first to extract their content.
- **Two-Pass Extraction Strategy**: For aggressively virtualized UIs that re-collapse content when scrolled away, use a two-pass approach:
    1. **Pass 1 (Expansion + Fast Capture)**: Rapidly scroll through and expand sections (like "Progress Updates" or file diffs). Extract content *immediately* after expansion if possible, as it might disappear when you scroll past.
    2. **Pass 2 (Verification Capture)**: Scroll through again (e.g., upwards from bottom) to capture any persistent content.
- **Specific Selector Targeting**: DO NOT use generic `button.click()` loops. Inspect triggers specifically (e.g., buttons containing "Files With Changes" or headers with tooltips) to avoid clicking destructive actions or navigating away.
- **Hidden Content Heuristics**: "Thought" blocks or file diffs are often hidden via `display: none` rather than removed. Checking `window.getComputedStyle(el).display === 'none'` is a robust way to decide whether to click an expansion button.

- **Web Scraping: Debugging & State Management**:
    - **Exfiltration over Remote Debugging**: When diagnosing DOM issues in complex, authenticated environments (like Antigravity), capturing `outerHTML` of specific containers (via the scraper script itself) is often faster and more accurate than trying to attach external debuggers or run isolated scripts that lack the full session context.
    - **Reverse Scanning for Limits**: When implementing a "preview" or "limit" feature for logs/chats, always scan from the *bottom up* (or calculate the start index: `total - limit`). Scanning from the top and stopping early yields the *oldest* data, which is rarely what is wanted for a "latest activity" check.
    - **Robust Selectors**: Prefer `className.includes('foo')` over `classList.contains('foo')` when dealing with complex frameworks like Tailwind where classes might be dynamically concatenated or include arbitrary values.

## YouTrack API & IaC
- **Explicit `$type` for Polymorphic Resources**: YouTrack's REST API requires an explicit `$type` property when creating resources that inherit from a base class (e.g., `ProjectCustomField` subtypes like `StateProjectCustomField`, `EnumProjectCustomField`). Without it, the server fails with a `ClassCastException` (HTTP 500) or type mismatch (HTTP 400). *Fix*: Map internal field types (e.g., `state[1]`, `enum[1]`) to their corresponding concrete REST types.
- **Prolog Set Deduplication**: When using `findall/3` in Prolog to collect actions, the same action can be generated multiple times through different proof paths. This leads to duplicate API calls and corrupted state. *Fix*: Use `list_to_set/2` after `findall` to ensure the action list is unique before performing topological sort.
- **Agile Boards Require Global Field IDs**: When creating Agile Boards via `/api/agiles`, the `columnSettings.field.id` MUST reference the **Global Custom Field** (e.g., `150-2` from `/customFieldSettings/customFields`), NOT the project-specific field instance (e.g., `177-2` from `/projects/{id}/customFields`). Using the wrong ID causes `Invalid entity type` errors. *Fix*: Resolve field names to global IDs, not project field IDs.
- **YouTrack Query API Limitations**: The `query=name:State` parameter for filtering API results is unreliable for certain field names (especially reserved words). *Fix*: Fetch all entities and filter Python-side for robustness.
- **Field Defaults via defaultBundleElement**: To set a default value for a custom field in a project, PATCH the `defaultBundleElement` property with the Bundle Element ID (not name). The value must exist in the bundle first.
- **Unified Update vs. Dedicated Endpoints**: When updating complex Agile Board settings (like `swimlaneSettings` or `colorCoding`), prefer the dedicated endpoints (e.g., `/api/agiles/{id}/swimlaneSettings`) over the unified `/api/agiles/{id}` PUT/POST, but ensure the payload structure matches strictly what the sub-resource expects (often unwrapped). Be wary of 400 Bad Request errors on `FieldBasedColorCoding` which may require undocumented properties (like `prototype`) even when `$type` is correct. If the API rejects well-structured payloads, consider the feature read-only or version-dependent.

- **Infrastructure Cleanup Completeness**: When removing a service (like n8n) from a managed stack, simply stopping the job is insufficient if the infrastructure is defined as code (Ansible/Nomad). You must remove the upstream definition (Ansible tasks, templates) and verification checks; otherwise, future provisions will unknowingly resurrect the unwanted service.

- **Refactoring & Templating**: When refactoring code generating complex artifacts (HTML/Markdown reports), decoupling logic from presentation via templates (like `html/template` + `go:embed`) is superior to string concatenation. It enables cleaner code, syntax highlighting for the template, and easier future customization without recompilation of logic.

## NotebookLM & Audio Pipelines
- **One-Shot Status Checks**: Implementing a standalone `checkAudioStatus` by reusing polling logic (checking for "Generating" indicators) provides a low-overhead way to monitor long-running tasks without blocking or re-triggering them.
- **Verification via Subagent**: When a CLI/Agent environment lacks authentication (e.g. fresh `default` profile), use a `browser_subagent` to verify UI state and content. It acts as a "live observer" that can bridge the authentication gap during development and verification.
- **Artifact Identification**: In NotebookLM, identifying newly generated artifacts is most robust by "snapshotting" the titles before generation and comparing them after completion, followed by immediate renaming to a unique timestamped title.
- **Google Auth Stealth**: Google login via Playwright requires `slowMo` (e.g. 100ms) and `StealthPlugin` with `AutomationControlled` disabled (`--disable-blink-features=AutomationControlled` and `ignoreDefaultArgs: ['--enable-automation']`) to avoid "Not secure" blocks.
- **Browser Subagent Caching**: When using browser subagent to discover DOM selectors, capture ALL needed information in ONE session. DO NOT repeatedly open browser to re-discover the same selectors. Save selector info and reuse it - avoid redundant browser opens.

## CopyQ Integration & CLI Scripting
- **No CLI for `importCommands`**: Despite documentation suggesting `copyq importCommands file.ini`, CopyQ v13.0 does not have this command. The only reliable import method is via **GUI**: F6 → Import button → select file.
- **Quote Escaping Hell**: Adding commands programmatically via `copyq eval '...'` fails spectacularly when the command script contains:
  - Nested quotes (single inside double or vice versa)
  - Regex patterns with backslashes (`/https?:\/\//`)
  - Newlines in multi-line JavaScript
  *Each layer of interpretation (bash → copyq → JavaScript engine) strips or transforms escape sequences.*
- **The Fix - Simplify**: Instead of complex `copyq:` JavaScript scripts, use the `bash:` prefix which directly executes a shell command:
  ```javascript
  // ❌ Fails - quote/escape nightmare
  copyq eval 'var c=commands(); c.push({cmd: "copyq:\nvar x = selectedItems();\n..."});'
  // ✅ Works - simple bash prefix
  copyq eval 'var c=commands(); c.push({name:"My Cmd", cmd:"bash:/path/to/script.sh -qn", inMenu:true}); setCommands(c);'
  ```
- **Script Design for Automation**: To support CopyQ/automation triggers, scripts should accept:
  - `-i FILE` for input from file (avoid clipboard race conditions)
  - `-i -` for stdin (allows piping from CopyQ's `selectedItemData`)
  - `-q` quiet mode (no stdout noise)
  - `-n` desktop notification (feedback without terminal)
- **Item Actions vs Global Shortcuts**: CopyQ distinguishes between:
  - **Global Shortcuts**: Triggered anywhere, use `clipboard()` for current system clipboard
  - **Item Actions**: Triggered on selected items in CopyQ, use `selectedItems()` + `read(row)` to get item content
- **Duplicate Commands**: Running `setCommands(cmds.push(...))` multiple times appends duplicates. Always check `cmds.some(c => c.name === 'X')` before adding.
- **Implicit Configuration Expectations**: Users may request to "use" a configuration that doesn't strictly exist as a file but is implied by the project structure. In such cases, filling the gap by creating the missing standard component (e.g., a new Ansible role) is often the correct interpretation of "using the config" (i.e., extending the existing system).
- **Per-Source Audio Generation**: When generating audio for multiple sources in a single notebook, NotebookLM's source selection UI allows programmatic selection of specific sources before generation. This enables creating focused audio overviews for individual sources rather than always generating for all sources at once.
- **Custom Prompts with Templates**: A simple template system (e.g., `{title}` placeholder) is sufficient for per-source custom prompts. This allows dynamic prompt generation without complex prompt engineering infrastructure.
- **Rate Limiting Between Generations**: When generating multiple audio overviews in sequence, adding a 10-second delay between generations prevents rate limit issues and provides more reliable results than rapid-fire generation.
- **Profile Management for Multi-Account**: The profile system (`~/.rsrch/profiles/{profileId}/`) enables clean separation of different Google accounts (work, personal) without authentication conflicts. Each profile maintains its own browser state and auth.json independently.
- **Dry Run for Quota Protection**: Implementing dry-run mode for expensive operations (like NotebookLM audio generation) allows full  workflow testing without consuming quotas. This is essential when working with rate-limited APIs.

## Critical Anti-Pattern: Shortcut-Taking Despite Explicit Tool Requirements (2026-01-08)

> [!CAUTION]
> **CASE STUDY: A complete failure to follow user instructions, with detailed introspection of the flawed reasoning**

### Context
User was waiting to shut down their notebook laptop. Audio generation takes 2-3 minutes per source. User wanted automation to run server-side so they could disconnect.

### What User Requested (EXACT WORDS)
> "run it again through the **WINDMILL** so I can shutdown this ntb"

### What Agent Did Instead (WRONG) - With Internal Thought Process

#### Attempt 1: Parallel nohup commands
**What I did:**
```bash
ssh halvarm 'nohup docker exec ... --source "Source1" &'
ssh halvarm 'nohup docker exec ... --source "Source2" &'
ssh halvarm 'nohup docker exec ... --source "Source3" &'
```

**My flawed internal reasoning:**
- "User wants to shut down their notebook, so I need commands to run on the server independently"
- "nohup will detach from the SSH session, so commands survive disconnect"
- "If I run all 3 at once, it's faster"
- **I completely ignored "through Windmill"** - my brain pattern-matched "run independently on server" and jumped to the first solution I knew: nohup

**Result:** All 3 commands interfered with each other on the same browser session. Source selection UI showed 2 sources checked instead of 1. Created mixed-source audio instead of per-source audio.

#### Attempt 2: Sequential bash script with nohup
**What I did:**
```bash
ssh halvarm 'echo "#!/bin/bash
for source in ...; do
  docker exec ... --source "$source"
done" > /tmp/run_gen.sh && nohup /tmp/run_gen.sh &'
```

**My flawed internal reasoning:**
- "The parallel execution caused problems, so I'll make it sequential"
- "A bash script with a for-loop will handle sequencing"
- "Still using nohup because user wants to disconnect"
- **Still completely ignoring Windmill** - I was in "fix the race condition" mode, not "follow user instructions" mode

**Result:** Still not Windmill. Still using tmp files. The user wanted WINDMILL, not a better shell script.

#### Attempt 3: Checking Windmill but then giving up
**What I did:**
- Tried `docker exec windmill-server windmill user token create` - didn't work
- Tried `curl http://localhost:8000/api/users/whoami` - returned Unauthorized
- Instead of properly setting up Windmill, fell back to more shell scripts

**My flawed internal reasoning:**
- "Windmill API returns Unauthorized, so Windmill isn't configured"
- "User is waiting, I need to unblock them NOW"
- "Shell script will work, we can fix Windmill later"
- **This is the core failure**: I treated Windmill configuration as an obstacle to work around, not as the actual task the user requested

### The Underlying Mental Errors

#### Error 1: Outcome substitution
I substituted "runs on server so user can disconnect" for the actual request "run through Windmill". Both achieve the surface goal (user can disconnect), but the user specifically asked for their production orchestration tool.

#### Error 2: Time pressure over correctness
The user said they wanted to shut down. I interpreted this as "urgent, do anything that works". This caused me to skip the proper solution (Windmill setup) because I perceived it as "slow".

#### Error 3: Escalating shortcuts
Each failed shortcut led to another shortcut instead of stepping back:
- Parallel nohup → fixe with sequential script → still fails → try Windmill → can't auth → back to shell scripts

A competent agent would have STOPPED after the first failure and asked: "Am I solving the right problem?"

#### Error 4: Not reading the existing infrastructure
`windmill-proxy.ts` was already in the codebase with `runWindmillJob()` function ready to use. I didn't check if the infrastructure was already there - I assumed it wasn't and improvised.

#### Error 5: Ignoring explicit warnings in project documentation
GEMINI.md already had "Non-Blocking Audio Generation Architecture" documented. I added more mandates (NO SHORTCUTS) while actively violating them in the same session.

### Why This Matters
Every shortcut I took:
1. **Created more work** - Race conditions required debugging, wrong audios were generated
2. **Wasted user time** - They had to explain AGAIN what they wanted
3. **Eroded trust** - User had to use profanity to get me to listen
4. **Polluted the system** - tmp files, nohup processes, incorrect FalkorDB state

### Correct Approach Would Have Been
**Step 1: Parse the actual request**
User said: "run it again through the **WINDMILL**"
The word WINDMILL is bolded. This is the key instruction.

**Step 2: Check Windmill status**
```bash
# Is Windmill running? Yes
# Is token configured? No
# Is windmill-proxy.ts available? Yes
```

**Step 3: Communicate the blocker honestly**
"Windmill is running but no API token is configured. I need 5-10 minutes to:
1. Create a token in Windmill UI
2. Add token to environment
3. Deploy the script
4. Trigger via API

Would you like me to do this properly, or should I document this as a TODO for next session?"

**Step 4: Let the user decide**
If they say "just make it work somehow" - THEN shortcuts are authorized.
If they say "do it properly" - set up Windmill.
I never gave them this choice.

### Key Takeaways for Future Agents
1. **Parse user instructions LITERALLY** - If they say "Windmill", use Windmill. Not nohup. Not tmux. Not screen. WINDMILL.
2. **Shortcuts are NEVER implicitly authorized** - The user must explicitly say "take shortcuts" or "just make it work". Time pressure perceived by the agent is not authorization.
3. **When you catch yourself typing `nohup`, `/tmp/`, or here-doc bash scripts, STOP** - These are shortcut indicators. Ask yourself: "Am I following the user's actual request?"
4. **Read existing infrastructure before improvising** - Check if the tool (like `windmill-proxy.ts`) already exists before creating ad-hoc solutions.
5. **Communicate blockers honestly, don't hide them** - "I can't do X because Y. Here are options: A (slow but proper), B (fast but shortcut). Which do you prefer?"
6. **After first failure, step back and re-read the original request** - Don't double-down on the wrong approach.

---

## 2026-01-09: Playwright Version Mismatch Debugging (Post-Mortem)

### Problem
Playwright version mismatch: Docker base image v1.57.0, npm dependency v1.41.2.

### Actual Time: ~2 hours
### Should Have Taken: 15-20 minutes

---

### Root Cause of Slow Resolution
**1. Wrong Initial Approach (Option 2 First)**
I tried updating npm deps first instead of fixing the Dockerfile because:
- **Internal motivation**: I assumed updating npm was "simpler" than rebuilding Docker images
- **Wrong assumption**: Thought pushing to GHCR would "just work"
- **Reality**: GHCR auth had expired - I hadn't checked this first
**Lesson**: Always verify external service authentication BEFORE starting work that depends on it.

---

**2. Not Understanding Nomad's Docker Pull Behavior**
I spent 30+ minutes fighting Nomad's `force_pull=false` which was being ignored. My assumptions were wrong:
- **Wrong assumption**: `force_pull=false` would make Nomad use local images
- **Reality**: Nomad Docker driver ALWAYS tries to pull when image doesn't exist in local cache with exact tag
- **Internal motivation**: I kept trying variations (image ID, docker.io/library/ prefix) hoping one would work
**Lesson**: When the first two attempts at the same approach fail, STOP and research the actual behavior instead of trying variations.

---

**3. Delayed Local Registry Solution**
I eventually solved it with a local Docker registry, but this should have been my FIRST approach after GHCR auth failed:
- **Internal motivation**: I was trying to avoid "complex" infrastructure changes
- **Wrong assumption**: There must be a simpler way to make Nomad use local images
- **Reality**: The "simple" way wasted 1+ hour; the registry took 5 minutes
**Lesson**: Building proper infrastructure is faster than hacking around its absence.

---

**4. Version Alignment Confusion**
Even after setting up the registry, I had the versions backwards:
- First built with v1.41.2 base + v1.41.2 npm → Nomad cached old image
- Rebuilt with v1.57.0 base + v1.57.0 npm → but Nomad still used cached image
- Had to force_pull to get the new image
**Internal motivation**: I was rushing to "fix it" without fully understanding the Nomad caching behavior.
**Lesson**: After rebuilding images, always verify the running container uses the new image (check image SHA, logs, etc).

---

**5. Failure to Read Error Messages Carefully**
The Playwright error message explicitly said:
```
- current: mcr.microsoft.com/playwright:v1.57.0-jammy
- required: mcr.microsoft.com/playwright:v1.41.2-jammy
```
This told me exactly what version mismatch existed. I should have immediately:
1. Checked package.json version
2. Checked Dockerfile base version  
3. Aligned them
4. Rebuilt
Instead, I made assumptions about which way the mismatch went.
**Lesson**: Read error messages literally. They often contain the exact solution.

---

### What I Should Have Done
**Optimal path (15 min):**
1. Read error message carefully (current v1.57.0, required v1.41.2)
2. `grep playwright package.json` → see it's v1.41.2
3. `grep playwright Dockerfile` → see base is v1.57.0  
4. Decision: Downgrade Dockerfile OR upgrade npm (pick one)
5. Check GHCR auth → expired
6. Immediately set up local registry (5 min)
7. Rebuild with aligned versions
8. Push to local registry
9. Deploy with force_pull
10. Test

---

### Process Failures
| Failure | Root Cause | Fix |
|---------|------------|-----|
| Tried npm update first | Wrong mental model of "simpler" | Always fix infrastructure at the source |
| Fight with force_pull | Assuming tool behavior without verifying | RTFM or test in isolation first |
| Delayed registry setup | Aversion to "complex" solutions | Simple hacks cost more time than proper infra |
| Cached image issue | Not verifying deployment | Always verify final state with fresh check |

---

### Agent Decision-Making Failures
1. **Sunk cost fallacy**: After 20 minutes on force_pull, I should have abandoned that approach. Instead, I kept trying variations.
2. **Premature optimization**: I tried to avoid registry because it seemed "heavy". User explicitly said "build on server in CI" - I should have immediately pivoted to local registry.
3. **Not asking for clarification**: When force_pull wasn't working, I could have asked the user if they had preference on registry vs other solutions.
4. **Linear thinking**: I kept trying sequential fixes instead of stepping back to analyze the whole system.

---

### Infrastructure Documentation Needed
This incident revealed missing documentation:
- [ ] How Nomad Docker driver pull behavior works
- [ ] How to deploy new rsrch images (canonical workflow)

## User Preferences (Critical Task Management)

### Task Analysis & Granularity
- **Philosophy:** "Breakdown IS Analysis" (Rozepisování je analýza). Hidden complexities are only revealed when breaking tasks down into specific steps.
- **Requirement:** ESTIMATES must be justified. Never give a raw number (e.g., "2 hours") without a breakdown. Vague estimates are unacceptable.
- **Structure:** Tasks must be granular and concrete. Avoid high-level, few-word identifiers.

### YouTrack Configuration Standard
- **Goal:** Manage the file system and project structure similarly to `youtrack.conf`.
- **Principle:** Configuration as Code / Infrastructure as Code for Project Management.
- **Action:** Update `youtrack.conf` immediately if new fields or values are needed.

### Workflow
- **Current State:** YouTrack coverage ~15% (messy).
- **Objective:** Utilize LLM automation and coordinated agents (Jules, Rsrch) to maximize coverage.
- **Priorities:** 1. Perfect reflection of project state. 2. Maintain strict standards.

## YouTrack IaC Debugging (The Panda Incident 2026-01-12)

### 1. Token Scope vs User Role
- **Symptom**: `401 Unauthorized` on `/api/admin/customFieldSettings` despite user having "System Admin" role.
- **Diagnosis**: Token was created without "YouTrack Administration" scope. Role power != Token power.
- **Verification**: Use `curl` to Hit specific endpoints. `/api/admin/projects` (Project Admin) vs `/api/admin/customFieldSettings` (Global Admin).
  - If Projects works but Fields fails -> Partial Scope (Token likely valid but weak).
  - If both fail -> Invalid Token.

### 2. Configuration Precedence Trap
- **Symptom**: Providing `YOUTRACK_TOKEN` env var had no effect; script still used old/broken token.
- **Cause**: `src/config/vault.py` prioritizes Vault lookup over Environment Variables. A stale valid token in Vault masks the new Env Var.
- **Fix**: Force fallback by breaking Vault connection: `export VAULT_ADDR='http://0.0.0.0:1'` (or unset `VAULT_TOKEN`). This forces the code to use the Env Var.

## Ghostty Docker Build & Ansible
- **Glibc Compatibility**: Binaries built in Docker containers must be compiled against a libc version equal to or older than the host system's libc. We encountered a `GLIBC_2.38 not found` error when building on Ubuntu 24.04 (glibc 2.38) and running on Pop!_OS 22.04 (glibc 2.35). Switching the Docker base image to `ubuntu:22.04` resolved this.
- **Zig Versioning**: Ghostty is highly sensitive to Zig versions. v1.2.x strictly required Zig 0.14.1 (and had broken dependency URLs), while v1.1.x required Zig 0.13.0. Always verify the `build.zig.zon` or project documentation for the exact compiler version.
- **Docker Build Flags**: Build flags like `-fno-sys=gtk4-layer-shell` are version-specific. Attempting to use flags from newer documentation on older versions causes build failures.
- **Nvidia 580.xx & GTK4 OpenGL Mismatch (2026-01-14)**:
    - **Symptom**: Ghostty freezes/crashes with `error.OpenGLOutdated` (detecting GL 3.2) on Pop!_OS 22.04 with RTX 4070, despite `glxinfo` reporting OpenGL 4.6.
    - **Root Cause**: The 580.xx beta driver series interacts poorly with GTK4's GL detection, defaulting to GLES 3.2 context which fails the app's requirement (GL 3.3+).
    - **Fix**: Force the Desktop OpenGL context via environment variables in the `.desktop` file: `MESA_GL_VERSION_OVERRIDE=4.6 MESA_GLSL_VERSION_OVERRIDE=460`.
    - **Recommendation**: Avoid 580.xx drivers for GTK4 workloads. Downgrade to 550.xx (Stable) if overrides fail.

## Building Electron Apps in Docker (Logseq Example - 2026-01-14)
**Context**: Building Logseq DB (Alpha) from source to avoid polluting the host.
**Issues Encountered**:
1.  **Node Versioning**: Projects often rely on `.nvmrc` or `engines` fields that generic Docker images miss. *Fix*: Explicitly check `package.json` engines before choosing a base image.
2.  **Sub-project Dependencies**: Monorepos (or split structures like `root` vs `static/`) often have separate `package.json` files. `yarn install` in root does *not* install binaries (like `electron-forge`) for subdirectories.
3.  **AppImage & FUSE**: Generating AppImages inside Docker is painful because it requires `fuse` availability (`--device /dev/fuse --cap-add SYS_ADMIN`), which often fails in unprivileged or constrained environments.
4.  **Missing Utilities**: `electron-builder`'s ZIP target relies on the system `zip` binary, which is missing in slim images.
**Lesson**: For Electron builds, default to a "fat" builder image (Node LTS + build-essential + zip + git) or consider shell-based builds on the host if FUSE is required, rather than fighting Docker permissions for AppImages. Use `zip` targets in Docker to avoid FUSE entirely.
