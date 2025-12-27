# Proposal 004: FalkorDB Implementation Plan - Resource Allocation & Cost Tracking

**Status**: Proposed
**Date**: 2025-12-27
**Target System**: `@agents/shared` & `angrav`

## Context
As agents become more autonomous, they consume finite resources: API tokens (OpenAI/Anthropic), compute time, and financial budget. Currently, we have no tracking of *how much* a specific Session or Goal costs, nor mechanisms to enforce limits ("Stop if this task exceeds $5").

## Proposed Schema

Introduce `Budget`, `Cost`, and `Allocation` nodes to track consumption against limits.

```cypher
(:Budget {
    id: UUID,
    name: "Monthly Research Stipend",
    limitUsd: 50.00,
    resetPeriod: "monthly"
})

(:Cost {
    id: UUID,
    amountUsd: 0.15,
    tokens: 4500,
    model: "gpt-4-turbo",
    timestamp: timestamp
})

(:Allocation {
    resourceType: "api_tokens",
    amount: 100000,
    reservedFor: "session-uuid"
})
```

### Relationships

- **(Session)-[:INCURRED]->(Cost)**: Granular tracking of spend per session.
- **(Goal)-[:FUNDED_BY]->(Budget)**: High-level budget assignment.
- **(Cost)-[:DRAINS]->(Budget)**: Aggregates spend against the limit.
- **(Agent)-[:ALLOCATED]->(Allocation)**: Reservation of resources (e.g., "This agent gets 1GB RAM").

## Usage Scenarios

1.  **Cost Guardrails**: Before making a high-cost query (e.g., Deep Research), the agent checks:
    ```cypher
    MATCH (b:Budget)<-[:DRAINS]-(c:Cost)
    MATCH (s:Session {id: $id})-[:EXECUTED_IN]->(:Task)<-[:HAS_SUBTASK]-(:Goal)-[:FUNDED_BY]->(b)
    WITH b, sum(c.amountUsd) as usage
    WHERE usage > b.limitUsd
    RETURN "Budget Exceeded"
    ```
    
2.  **ROI Analysis**: After completing a Task, calculate its efficiency:
    ```cypher
    MATCH (t:Task)-[:EXECUTED_IN]->(s:Session)-[:INCURRED]->(c:Cost)
    RETURN t.name, sum(c.amountUsd) as totalCost
    ```
    "Task 'Refactor Header' cost $0.45."

3.  **Dynamic Provisioning**: If `rsrch` needs a high-memory browser:
    ```cypher
    MATCH (n:Node {type: 'k8s-pod', status: 'available'})
    WHERE n.memory >= '8Gi'
    CREATE (s:Session)-[:ALLOCATED]->(n)
    ```

## Implementation Steps

1.  Update `FalkorClient` with `trackCost(sessionId, model, tokens, usdAmount)`.
2.  Implement `checkBudget(sessionId)` middleware in `angrav` and `rsrch`.
3.  Add token pricing tables to `@agents/shared/config`.
