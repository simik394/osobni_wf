# Lessons Learned: Project 01-pwf

This document serves as the centralized repository for all technical, process, and agentic insights gained during the development of this project.

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
- **Stealth Plugin Dependencies**: `puppeteer-extra-plugin-stealth` can fail with "dependency not found (stealth/evasions/chrome.app)" in some persistent environments or when bundled. If this blocks execution, disabling the plugin is a valid temporary workaround for local tools, provided you don't aggressively scrape.
- **Binary vs Source Execution**: When debugging CLI tools (like `rsrch`), always verify if the global command is an alias to a stale binary (`pkg` snapshot) or the actual local code. Prefer running `node dist/index.js` or `ts-node src/index.ts` directly during development to ensure you are testing the latest changes.

## Infrastructure & Remote Browsers
- **Host Networking & Zombies**: Running Docker containers with `network_mode: "host"` binds process ports directly to the host interface. If the container or entrypoint crashes (e.g. `socat`), the process may become a zombie or stay detached, holding the port and preventing restart. ALWAYS automate cleanup (e.g., `killall socat`, `docker rm -f`) in restart scripts or playbooks.
- **Port Conflict Management**: When running multiple browser instances (e.g. `rsrch` + `angrav`), strictly assign distinct ports for VNC and CDP. Relying on "random selection" or defaults (5900, 9222) guarantees collisions.
- **Sidecar Availability**: `socat` sidecars for port forwarding are brittle if the target (Chrome) isn't ready. Use a wait loop (poll port) or a dedicated startup script that sequences the browser launch before the proxy.
- **ARM64 Compatibility**: Standard Selenium images often lack ARM64 support or are unoptimized. Use `seleniarm/standalone-chromium` for reliability on `aarch64` servers (like OCI Ampere A1).
- **Docker Build Context**: When building images on a remote server, simple `scp` of the source directory is often faster and more reliable than configuring remote Docker contexts, especially for ad-hoc builds.

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

