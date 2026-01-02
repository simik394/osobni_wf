# Feature Proposal: Reports in YAML

## Summary
Enable declarative management of YouTrack reports (Burndown, Cumulative Flow) through YAML configuration.

## Motivation
- **Reproducibility**: Reports recreated automatically if YouTrack is rebuilt
- **Consistency**: Standard reports across all projects
- **Discoverability**: Teams know exactly what reports exist

## Proposed YAML Schema

```yaml
# In project.yaml or global config
reports:
  # Burndown Report
  - name: "Sprint Burndown"
    type: burndown
    projects: ["DEMO"]
    date_range: "last_30_days"  # Or: current_sprint, last_sprint, custom
    estimation_field: "Story Points"  # Optional, defaults to issue count
    
  # Cumulative Flow Report  
  - name: "Issue Flow by State"
    type: cumulative_flow
    projects: ["DEMO", "CORE"]
    date_range: "last_90_days"
    field: "State"
```

## In Scope (Managed by IaC)

| Feature | Notes |
|---------|-------|
| Report creation | Create if missing |
| Report name | Primary identifier |
| Report type | `burndown`, `cumulative_flow` |
| Projects filter | Which projects to include |
| Date range | Relative ranges preferred |
| Field selection | For CF: which field to chart |
| Estimation field | For burndown: what to measure |

## Out of Scope (Manual Management)

| Feature | Reason |
|---------|--------|
| User-specific reports | Too personalized, not infrastructure |
| Chart colors/styling | UI preference, not data |
| Export settings | One-time actions |
| Complex custom filters | Too varied to standardize |
| Report sharing permissions | Use group visibility instead |
| Dashboard placement | UI layout, not data |

## Date Range Options

| Value | Description |
|-------|-------------|
| `last_7_days` | Rolling 7-day window |
| `last_30_days` | Rolling 30-day window |
| `last_90_days` | Rolling 90-day window |
| `current_sprint` | Current active sprint (requires board reference) |
| `last_sprint` | Previous sprint |
| `all_time` | Since project creation |

## API Endpoints

- `GET /api/reports` - List reports
- `POST /api/reports` - Create report
- `POST /api/reports/{id}` - Update report
- `DELETE /api/reports/{id}` - Delete report
- `POST /api/reports/{id}/status` - Trigger recalculation

## Implementation Notes

1. **Report Types**: YouTrack has many report types; start with only Burndown and Cumulative Flow
2. **Idempotency**: Match by name; update if exists, create if missing
3. **Deletion**: Use `state: absent` like other resources
4. **Sprint Reference**: For `current_sprint` range, need board reference

## Estimated Effort

| Component | Effort |
|-----------|--------|
| Schema | Low |
| Translator | Medium |
| Prolog | Medium |
| Actuator | Medium |
| Testing | Medium |

**Total**: ~1 day implementation

## Decision

- [ ] Approved for implementation
- [ ] Needs revision
- [ ] Rejected

---
*Proposal created: 2026-01-02*
