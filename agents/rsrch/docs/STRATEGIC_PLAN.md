# rsrch Strategic Plan

> **Document Version:** 1.0  
> **Date:** 2026-01-09  
> **Author:** System Architect  
> **Status:** Draft - Awaiting Review

## 1. Executive Summary

**rsrch** is a research automation platform that unifies AI research sources (Gemini, Perplexity, NotebookLM) through browser automation, providing a scriptable workflow engine for knowledge workers.

### Vision Statement
> A unified research orchestration platform where all AI research tools expose a consistent interface, share state through a graph database, and can be composed into complex multi-step workflows.

### Current State
- 35 source files, ~530KB TypeScript
- 3 major clients: Gemini, Perplexity, NotebookLM
- OpenAI-compatible API server
- FalkorDB for state tracking (partial integration)
- Windmill for job orchestration

### Target State
- Unified `ResearchAgent` interface for all sources
- Real-time FalkorDB state sync (every browser action)
- Full workflow scripting via Windmill flows
- Multi-user concurrent access without race conditions
- Content injection, Gems, Canvas support

---

## 2. Strategic Pillars

### Pillar 1: Unified Interface Layer
**Goal:** Abstract all research sources behind a common interface.

```typescript
interface ResearchAgent {
  // Identity
  readonly name: string;
  readonly capabilities: Capability[];
  
  // Core operations
  query(prompt: string, options?: QueryOptions): Promise<ResearchResult>;
  getSession(id: string): Promise<Session>;
  listSessions(): Promise<Session[]>;
  
  // State
  getState(): AgentState;
  onStateChange(handler: StateChangeHandler): void;
}
```

**Trade-offs:**
| Approach | Pros | Cons |
|----------|------|------|
| Abstract interface | Clean API, easier testing | May hide unique capabilities |
| Feature flags | Preserves uniqueness | More complex consumer code |
| **Hybrid (recommended)** | Best of both | Moderate complexity |

### Pillar 2: Event-Driven State Architecture
**Goal:** FalkorDB as single source of truth with event-sourced state.

```
Browser Action → Event → FalkorDB Write → Subscribers Notified
                              ↓
                    [Redis Pub/Sub or Webhook]
                              ↓
              Other services react to state change
```

**Events to Track:**
- `research.started`, `research.completed`, `research.failed`
- `audio.queued`, `audio.generating`, `audio.completed`
- `source.added`, `source.removed`
- `session.created`, `session.exported`

### Pillar 3: Workflow Composition Engine
**Goal:** Windmill flows that compose research operations.

**Example Flow:**
```yaml
flow: research-to-podcast
steps:
  - gemini.deepResearch(topic)
  - gemini.exportToDocs(session)
  - notebooklm.createNotebook(title)
  - notebooklm.addSource(docUrl)
  - notebooklm.generateAudio(sources)
```

### Pillar 4: Multi-Tenancy & Isolation
**Goal:** Concurrent users without interference.

**Architecture:**
- Browser pool (N containers per profile)
- Job queue with affinity (jobs route to correct profile)
- Session isolation via browser contexts

---

## 3. Risk Analysis

### R1: Platform Dependency (Critical)
| Factor | Assessment |
|--------|------------|
| **Risk** | Google/Perplexity can change UI anytime, breaking selectors |
| **Probability** | High (every 2-4 weeks) |
| **Impact** | Complete service outage |
| **Mitigation** | Selector health monitoring, fallback arrays, A/B selector testing |
| **Residual** | 2-4 hour MTTR when breakage detected |

### R2: Rate Limiting / Quota Exhaustion (High)
| Factor | Assessment |
|--------|------------|
| **Risk** | NotebookLM daily audio quota (varies), Gemini rate limits |
| **Probability** | Medium-High |
| **Impact** | Feature degradation |
| **Mitigation** | Quota tracking in FalkorDB, dry-run mode, queue throttling |

### R3: Authentication Expiry (Medium)
| Factor | Assessment |
|--------|------------|
| **Risk** | Google OAuth sessions expire, require re-auth |
| **Probability** | Medium (monthly) |
| **Impact** | Service interruption until VNC re-auth |
| **Mitigation** | Session health checks, proactive renewal, alerting |

### R4: Race Conditions in State Sync (Medium)
| Factor | Assessment |
|--------|------------|
| **Risk** | Concurrent operations cause FalkorDB inconsistency |
| **Probability** | Medium |
| **Impact** | Orphaned nodes, incorrect state |
| **Mitigation** | Atomic operations, transaction patterns, cleanup jobs |

### R5: Browser Resource Exhaustion (Medium)
| Factor | Assessment |
|--------|------------|
| **Risk** | Memory leaks in long-running Chrome instances |
| **Probability** | Medium |
| **Impact** | Degraded performance, crashes |
| **Mitigation** | Browser recycling, health monitoring, auto-restart |

---

## 4. Technical Architecture

### 4.1 Component Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                         Clients                              │
│   CLI  │  OpenWebUI  │  Windmill Flows  │  Direct API       │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                    rsrch Server (API)                        │
│  ┌──────────────┬──────────────┬──────────────┐             │
│  │ GeminiAgent  │ PerplexityAg │ NotebookAgent│             │
│  └──────┬───────┴──────┬───────┴──────┬───────┘             │
│         │              │              │                      │
│         ▼              ▼              ▼                      │
│  ┌─────────────────────────────────────────────┐            │
│  │           Unified Browser Manager            │            │
│  │    (Profile switching, Tab management)       │            │
│  └──────────────────────┬──────────────────────┘            │
└─────────────────────────┼───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                   Browser Containers                         │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐                      │
│  │ Chrome  │  │ Chrome  │  │ Chrome  │  (Pool per profile)  │
│  │ Profile1│  │ Profile2│  │ ProfileN│                      │
│  └────┬────┘  └────┬────┘  └────┬────┘                      │
└───────┼────────────┼────────────┼───────────────────────────┘
        │            │            │
        ▼            ▼            ▼
┌─────────────────────────────────────────────────────────────┐
│                      State Layer                             │
│  ┌────────────────────┐    ┌────────────────────┐           │
│  │     FalkorDB       │◄───│    Event Stream    │           │
│  │  (Graph State)     │    │   (State Changes)  │           │
│  └────────────────────┘    └────────────────────┘           │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 Data Model (FalkorDB)

```cypher
// Nodes
(:Notebook {id, title, platformId, createdAt})
(:Source {id, title, url, type})
(:AudioOverview {id, title, duration, createdAt})
(:PendingAudio {id, status, windmillJobId, createdAt})
(:GeminiSession {id, type, title, createdAt})
(:PerplexityThread {id, query, createdAt})
(:ResearchDoc {id, title, url, exportedAt})

// Relationships
(n:Notebook)-[:HAS_SOURCE]->(s:Source)
(n:Notebook)-[:HAS_AUDIO]->(a:AudioOverview)
(a:AudioOverview)-[:DERIVED_FROM]->(s:Source)
(g:GeminiSession)-[:PRODUCED]->(d:ResearchDoc)
(d:ResearchDoc)-[:IMPORTED_TO]->(n:Notebook)
```

---

## 5. Feature Roadmap

### Phase 1: Foundation (Current → +2 weeks)
- [x] FalkorDB PendingAudio state sync
- [ ] Complete Windmill integration
- [ ] Unified ResearchAgent interface
- [ ] Event-driven state changes

### Phase 2: Core Features (+2 → +6 weeks)
- [ ] Gemini Gems management
- [ ] Content injection (sources → Gemini context)
- [ ] Canvas support (Gemini)
- [ ] Multi-profile concurrent execution

### Phase 3: Workflow Engine (+6 → +10 weeks)
- [ ] Windmill flow templates
- [ ] Cross-agent workflows (Gemini → NotebookLM)
- [ ] Scheduling and recurring jobs
- [ ] Quota management

### Phase 4: Scale & Polish (+10 → +14 weeks)
- [ ] Browser pool management
- [ ] Rate limiting and throttling
- [ ] Comprehensive monitoring
- [ ] Documentation and SDK

---

## 6. Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Mean Time to Recovery (selector break) | 2-4 hours | < 30 min |
| State sync latency | 500ms+ | < 100ms |
| Concurrent jobs supported | 1 | 10+ |
| Test coverage | 0% | 60%+ |
| API uptime | N/A | 99.5% |

---

## 7. Next Steps

1. **Immediate:** Create WBS issues in YouTrack
2. **This week:** Unified interface design doc
3. **Next sprint:** Complete FalkorDB state sync
4. **Review:** Bi-weekly architecture review

---

*Document maintained at: `/agents/rsrch/docs/STRATEGIC_PLAN.md`*
