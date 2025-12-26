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
