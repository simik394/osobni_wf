# Proposal 001: FalkorDB Implementation Plan - Work Hierarchy Schema

**Status**: Proposed
**Date**: 2025-12-27
**Target System**: `falkor-client` (@agents/shared)

## Context
Currently, the system tracks `Sessions` and `Interactions`. While this provides a linear history, it lacks hierarchical context. Agents don't know *why* a session was started or how it relates to broader objectives.

## Proposed Schema

To enable autonomous long-term planning, we propose introducing `Goal` and `Task` nodes.

```cypher
(:Goal {
    id: UUID,
    name: "Integrate FalkorDB",
    status: "active", // active, completed, suspended
    priority: 1,      // 1 (high) to 5 (low)
    createdAt: timestamp
})

(:Task {
    id: UUID, 
    description: "Create shared client library",
    status: "done",
    createdAt: timestamp,
    completedAt: timestamp
})
```

### Relationships

- **(Goal)-[:HAS_SUBTASK]->(Task)**: Decomposes high-level goals.
- **(Task)-[:EXECUTED_IN]->(Session)**: Links work sessions to specific tasks.
- **(Goal)-[:DEPENDS_ON]->(Goal)**: Enables dependency graph for complex projects.

## Usage Scenarios

1.  **Context Restoration**: When an agent starts, it can query:
    ```cypher
    MATCH (s:Session {status: 'active'})<-[:EXECUTED_IN]-(t:Task)<-[:HAS_SUBTASK]-(g:Goal)
    RETURN g.name, t.description
    ```
    To immediately understand: "I am working on *Create shared client library* as part of *Integrate FalkorDB*."

2.  **Autonomous Reporting**: Automated weekly reports can group sessions by Goal, calculating progress percentages based on completed subtasks.

## Implementation Steps

1.  Update `FalkorClient` with `createGoal()`, `createTask()`, `linkSessionToTask()`.
2.  Update `angrav` startup to checking for active Goals/Tasks before starting a generic session.
