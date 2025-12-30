# Planner Feature Proposals

This directory contains feature proposals for the Task Planner.

## Proposals

| # | Feature | Priority | Complexity | Status |
|---|---------|----------|------------|--------|
| 01 | [[01_what_if_scenarios\|What-If Scenarios]] | High | ★☆☆ | Proposed |
| 02 | [[02_goal_progress_tracker\|Goal Progress Tracker]] | High | ★☆☆ | Proposed |
| 03 | [[03_youtrack_integration\|YouTrack Integration]] | High | ★★☆ | Proposed |
| 04 | [[04_deadline_slack\|Deadline Slack Analysis]] | Medium | ★☆☆ | Proposed |
| 05 | [[05_windmill_integration\|Windmill Integration]] | High | ★★☆ | Proposed |
| 06 | [[06_historical_learning\|Historical Learning]] | Low | ★★★ | Proposed |

## Implementation Order (Recommended)

1. **What-If Scenarios** - Easiest, immediate value
2. **Goal Progress Tracker** - Natural companion to what-if
3. **YouTrack Integration** - Connects planner to real data
4. **Windmill Integration** - Automates the dispatch pipeline
5. **Deadline Slack Analysis** - CPM algorithm, useful for deadlines
6. **Historical Learning** - Most complex, needs data accumulation

## Related Code

- **Planner**: `/agents/planner/` (Python, OR-Tools)
- **Jules Solver**: `/agents/angrav/src/solvers/jules.ts` (TypeScript)
- **Windmill Flows**: `/agents/angrav/windmill/` (TypeScript)
