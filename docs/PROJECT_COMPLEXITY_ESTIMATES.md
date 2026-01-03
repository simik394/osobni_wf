# PWF Project Complexity Analysis

> **Generated**: 2026-01-03  
> **Purpose**: Detailed effort/complexity estimation for YouTrack project planning

---

## Summary Matrix

| Project | Current LOC | Planned Work | Total Effort | Complexity |
|---------|-------------|--------------|--------------|------------|
| **RSRCH** | 12,320 | Gemini Gems, Git import, MCP server | **~60h** | 🔴 High |
| **ANGRAV** | 7,549 | Langfuse, Tests, Context selectors | **~35h** | 🔴 High |
| **PLAN** | 2,139 | PM Agent (7 proposals!), Full automation | **~80h** | 🔴 High |
| **LIBR** | 5,354 | Obsidian plugin, WebSocket, PDF, Prolog | **~65h** | 🔴 High |
| **SHARED** | 1,277 | MCP wrappers, More clients | **~25h** | 🟡 Medium |
| **YTIAC** | 4,067 | Reports IaC | **~30h** | 🟡 Medium |
| **INFRA** | 2,052 | New services as needed | **Ongoing** | 🟢 Low |
| **FLOWS** | ~500 | Formalize workflows | **~30h** | 🟢 Low |

> **Key Insight**: LOC measures *what exists*. The PLAN project has only 2.1k LOC but **7 proposal documents** outlining ~80h of planned work including a full PM Agent.

---

## Detailed Project Analysis

### 1. RSRCH (Research Agent)

**Path**: `agents/rsrch/`  
**Tech Stack**: TypeScript, Playwright, Node.js  
**Deployment**: Docker, Nomad Job

| Metric | Value |
|--------|-------|
| **Lines of Code** | 12,320 |
| **Source Files** | 29 |
| **Test Files** | 17 |
| **Documentation** | README, API.md, CLI.md, AGENTS.md, USER_GUIDE.md |
| **External Deps** | Playwright, Redis, Discord webhooks |

**TODO Backlog Analysis**:
- ✅ ~85% features complete
- 🔲 Verbose CLI logging (~2h)
- 🔲 Gemini Gems support (~8h)
- 🔲 File upload to chat (~4h)
- 🔲 Documentation separation (~1h)

**Effort Estimate**: ~15h remaining  
**Complexity Rating**: 🔴 High (browser automation, multi-service integration)

---

### 2. ANGRAV (Antigravity Scraper)

**Path**: `agents/angrav/`  
**Tech Stack**: TypeScript, Playwright  
**Deployment**: Docker, GHCR

| Metric | Value |
|--------|-------|
| **Lines of Code** | 7,549 |
| **Source Files** | 26 |
| **Test Files** | 16 |
| **Documentation** | README, 12 spec docs |
| **External Deps** | Playwright, Langfuse (planned) |

**TODO Backlog Analysis** (from TODO.md):
- ✅ Phases 1-5 complete
- 🔲 Phase 7: Langfuse Telemetry (~9.5h)
- 🔲 Context selectors finalization (~4h)
- 🔲 Automated tests (~8h)
- 🔲 Technical debt (~5h)

**Effort Estimate**: ~26.5h remaining (per their own WBS)  
**Complexity Rating**: 🔴 High (fragile DOM selectors, session state)

---

### 3. YTIAC (YouTrack IaC)

**Path**: `infrastruct/configs/youtrack.conf/`  
**Tech Stack**: Python, SWI-Prolog, Janus  
**Deployment**: Docker container, batch job

| Metric | Value |
|--------|-------|
| **Lines of Code** | 4,067 (Python + Prolog) |
| **Source Files** | 13 |
| **Test Files** | 5 (19 tests) |
| **Documentation** | README (comprehensive), API coverage doc |
| **External Deps** | YouTrack REST API, HashiCorp Vault |

**TODO Backlog Analysis**:
- ✅ Phase 1-12 complete (Fields, Bundles, Boards, Tags, Queries)
- 🔲 Reports IaC (proposal exists, ~20h)
- 🔲 Schema validation improvements (~5h)
- 🔲 Additional Prolog tests (~5h)

**Effort Estimate**: ~10h for polish, ~20h for Reports feature  
**Complexity Rating**: 🟡 Medium (stable API, well-tested)

---

### 4. LIBR (Vault Librarian)

**Path**: `integrations/mapObsi/`  
**Tech Stack**: Go, FalkorDB, Cypher  
**Deployment**: CLI binary, optional daemon

| Metric | Value |
|--------|-------|
| **Lines of Code** | 5,354 |
| **Source Files** | 17 |
| **Test Files** | 50+ tests across 4 suites |
| **Documentation** | README, SCHEMA.md, EXTENSIBILITY.md, CHANGELOG.md |
| **External Deps** | FalkorDB, Obsidian vault structure |

**TODO Backlog Analysis** (from TODO.md):
- ✅ Phases 1-3 complete (Core, Query, Windmill)
- 🔲 Phase 4: Advanced Features
  - PDF extraction (~10h)
  - Chat history import (~8h)
  - Semantic search (~15h)
- 🔲 Phase 5: Real-time Sync
  - Obsidian plugin (~20h)
  - WebSocket service (~15h)
- 🔲 Phase 6: Prolog validation (~12h)

**Effort Estimate**: ~40h for Phase 4-6  
**Complexity Rating**: 🔴 High (graph queries, real-time sync, plugin dev)

---

### 5. PLAN (Planner)

**Path**: `agents/planner/`  
**Tech Stack**: Python  
**Deployment**: CLI

| Metric | Value |
|--------|-------|
| **Lines of Code** | 2,139 |
| **Source Files** | 8 |
| **Test Files** | 0 |
| **Proposal Docs** | **7 files** (20+ pages of specs) |
| **Documentation** | README, SOLVER_REGISTRY.md |
| **External Deps** | YouTrack MCP, Redis |

**Analysis**:
This is a **deceptively small project by LOC** but has the largest planned roadmap.

**Proposal Backlog** (`proposals/`):
| Proposal | Effort | Status |
|----------|--------|--------|
| `01_what_if_scenarios.md` | ~8h | Planned |
| `02_goal_progress_tracker.md` | ~10h | Planned |
| `03_youtrack_integration.md` | ~12h | Partial |
| `04_deadline_slack.md` | ~6h | Planned |
| `05_windmill_integration.md` | ~10h | Planned |
| `06_historical_learning.md` | ~12h | Planned |
| `07_pm_agent.md` | ~20h | Planned |

**Total Planned Work**: ~80h  
**Complexity Rating**: 🔴 **High** (7 proposals, PM Agent architecture, YouTrack integration)

---

### 6. SHARED (Agent Library)

**Path**: `agents/shared/`  
**Tech Stack**: TypeScript  
**Deployment**: npm package (internal)

| Metric | Value |
|--------|-------|
| **Lines of Code** | 1,277 |
| **Source Files** | 6 |
| **Test Files** | 1 |
| **Documentation** | docs/ (9 files) |
| **External Deps** | Consul, FalkorDB, Nomad |

**Analysis**:
- Service discovery, tab pooling, human-lock
- Nomad job helpers
- FalkorDB automation client

**TODO Backlog** (estimated):
- 🔲 Expand test coverage (~8h)
- 🔲 MCP server wrapper (~5h)
- 🔲 Better type exports (~2h)

**Effort Estimate**: ~15h  
**Complexity Rating**: 🟡 Medium (library code, needs stability)

---

### 7. INFRA (Infrastructure Stack)

**Path**: `infrastruct/nomad_stack/`, `infrastruct/ansible/`, `infrastruct/terraform/`  
**Tech Stack**: Ansible, HCL (Nomad), Jinja2, Terraform  
**Deployment**: Remote server (`halvarm`)

| Metric | Value |
|--------|-------|
| **Lines of Code** | 2,052 (Ansible/HCL/Jinja) |
| **Config Files** | 23 |
| **Test Files** | 0 |
| **Documentation** | Embedded in playbooks |

**Analysis**:
- Stable, operational infrastructure
- Incremental changes as new services added
- No formal test suite (manual verification)

**Effort Estimate**: Ongoing (~2-5h/week maintenance)  
**Complexity Rating**: 🟢 Low (mature, incremental changes)

---

### 8. FLOWS (Flows & Processes)

**Path**: `flows/`  
**Tech Stack**: Markdown (documentation)  
**Deployment**: N/A (knowledge base)

| Metric | Value |
|--------|-------|
| **Lines of Code** | ~500 (Markdown) |
| **Files** | 5 |
| **Documentation** | Self-documenting |

**Analysis**:
- Process documentation only (no code)
- Could be merged into another project
- Consider: Is this a "project" or just docs for PWF?

**Effort Estimate**: ~30h to formalize into actionable workflows  
**Complexity Rating**: 🟢 Low (documentation only)

---

## Recommended YouTrack Field Configuration

Based on complexity, I recommend these custom fields:

| Field | Type | Values |
|-------|------|--------|
| **Complexity** | Enum | Low, Medium, High |
| **Tech Stack** | Enum | TypeScript, Python, Go, Prolog, Ansible |
| **Deployment** | Enum | Docker, Nomad, CLI, Library |
| **Test Coverage** | Integer | 0-100% |
| **Remaining Effort** | Period | Hours |

---

## Priority Ranking (by Total Effort)

| Priority | Project | LOC | Planned | Total Effort |
|----------|---------|-----|---------|--------------|
| 1 | **PLAN** | 2.1k | 7 proposals | **~80h** |
| 2 | **LIBR** | 5.4k | Plugin + PDF | **~65h** |
| 3 | **RSRCH** | 12.3k | Gems + MCP | **~60h** |
| 4 | **ANGRAV** | 7.5k | Langfuse + Tests | **~35h** |
| 5 | **YTIAC** | 4.1k | Reports | **~30h** |
| 6 | **FLOWS** | ~500 | Formalize | **~30h** |
| 7 | **SHARED** | 1.3k | MCP clients | **~25h** |
| 8 | **INFRA** | 2.1k | Incremental | **Ongoing** |

> **Surprise**: PLAN has the smallest codebase but the largest roadmap. It's the "iceberg project"—most of the work is below the waterline in proposal docs.

