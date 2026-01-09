# rsrch Cost & Time Estimation

> **Document Version:** 1.0  
> **Date:** 2026-01-09  
> **Estimation Method:** Expert judgment + bottom-up task breakdown

## 1. Assumptions

| Assumption | Value |
|------------|-------|
| Developer capacity | 1 FTE equivalent (split across sessions) |
| Working hours/day | 4-6 productive hours |
| Buffer factor | 1.3x (for unknowns) |
| Review overhead | 15% of development time |

## 2. Work Breakdown Structure (Summary)

### Phase 1: Foundation (Weeks 1-2)
| Epic | Tasks | Est. Hours | Risk |
|------|-------|------------|------|
| FalkorDB Complete Sync | 5 tasks | 16h | Low |
| Windmill Full Integration | 4 tasks | 12h | Medium |
| Unified Interface Base | 3 tasks | 8h | Low |
| **Phase 1 Total** | **12 tasks** | **36h** | — |

### Phase 2: Core Features (Weeks 3-6)
| Epic | Tasks | Est. Hours | Risk |
|------|-------|------------|------|
| Gemini Gems Management | 4 tasks | 16h | Medium |
| Content Injection | 5 tasks | 20h | High |
| Canvas Support | 4 tasks | 16h | Medium |
| Multi-Profile Execution | 3 tasks | 12h | Low |
| **Phase 2 Total** | **16 tasks** | **64h** | — |

### Phase 3: Workflow Engine (Weeks 7-10)
| Epic | Tasks | Est. Hours | Risk |
|------|-------|------------|------|
| Flow Templates | 4 tasks | 16h | Low |
| Cross-Agent Workflows | 5 tasks | 24h | High |
| Scheduling System | 3 tasks | 12h | Medium |
| Quota Management | 3 tasks | 10h | Low |
| **Phase 3 Total** | **15 tasks** | **62h** | — |

### Phase 4: Scale & Polish (Weeks 11-14)
| Epic | Tasks | Est. Hours | Risk |
|------|-------|------------|------|
| Browser Pool | 4 tasks | 16h | Medium |
| Rate Limiting | 3 tasks | 8h | Low |
| Monitoring & Alerting | 5 tasks | 16h | Low |
| Documentation | 4 tasks | 12h | Low |
| **Phase 4 Total** | **16 tasks** | **52h** | — |

---

## 3. Total Effort Summary

| Phase | Tasks | Hours | Weeks (4h/day) |
|-------|-------|-------|----------------|
| Phase 1: Foundation | 12 | 36h | 2 |
| Phase 2: Core Features | 16 | 64h | 4 |
| Phase 3: Workflow Engine | 15 | 62h | 4 |
| Phase 4: Scale & Polish | 16 | 52h | 3 |
| **Subtotal** | **59** | **214h** | **13** |
| + Buffer (30%) | — | 64h | 4 |
| **Grand Total** | **59 tasks** | **278h** | **17 weeks** |

---

## 4. Cost Estimation

### Infrastructure Costs (Monthly)
| Resource | Provider | Monthly Cost |
|----------|----------|--------------|
| VPS (halvarm) | Oracle Cloud | $0 (free tier) |
| FalkorDB | Self-hosted | $0 |
| Windmill | Self-hosted | $0 |
| Domain/SSL | Existing | $0 |
| **Total Infrastructure** | — | **$0/month** |

### Development Costs
| Item | Hours | Rate | Cost |
|------|-------|------|------|
| Development | 214h | Internal | — |
| Testing | 30h | Internal | — |
| Documentation | 12h | Internal | — |

### Risk Contingency
| Risk | Probability | Impact | Contingency |
|------|-------------|--------|-------------|
| Platform Breaking Changes | High | 20h extra | +20h |
| Architectural Refactoring | Medium | 15h extra | +15h |
| Integration Issues | Medium | 10h extra | +10h |
| **Total Contingency** | — | — | **+45h** |

---

## 5. Timeline (Gantt-style)

```
Week  1  2  3  4  5  6  7  8  9  10 11 12 13 14 15 16 17
      │──────│                                          Phase 1
            │────────────────────│                      Phase 2
                                 │───────────────────│  Phase 3
                                                    │───│ Phase 4
      ▼
     Now
```

### Key Milestones
| Milestone | Target Date | Dependencies |
|-----------|-------------|--------------|
| M1: FalkorDB Complete | Week 2 | — |
| M2: Unified Interface | Week 4 | M1 |
| M3: Gems + Content Injection | Week 6 | M2 |
| M4: Workflow Engine MVP | Week 9 | M3 |
| M5: Production Ready | Week 14 | M4 |

---

## 6. Resource Allocation

### Skills Required
| Skill | Priority | Available |
|-------|----------|-----------|
| TypeScript | High | ✅ |
| Playwright | High | ✅ |
| FalkorDB/Cypher | Medium | ✅ |
| Windmill | Medium | ✅ |
| Docker/Nomad | Low | ✅ |

### Bottlenecks
1. **Browser Automation Expertise** - Selector debugging is time-intensive
2. **Platform Knowledge** - Gemini/NotebookLM internals are opaque
3. **Testing Difficulty** - Real browser tests are slow and flaky

---

## 7. Recommendations

### Quick Wins (Do First)
1. Fix hardcoded Docker container ID (15 min)
2. Complete FalkorDB state sync (4 hours)
3. Add health check endpoints (2 hours)

### High-Value Investments
1. Unified interface → unlocks all future features
2. Selector health monitoring → reduces MTTR

### Defer If Possible
1. Canvas support (new area, high uncertainty)
2. Browser pooling (over-engineering for current scale)

---

*Document maintained at: `/agents/rsrch/docs/COST_ESTIMATION.md`*
