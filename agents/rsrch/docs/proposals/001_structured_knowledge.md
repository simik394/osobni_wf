# Proposal 003: Structured Knowledge Graph (Learnings)

**Status**: Proposed
**Date**: 2025-12-27
**Target System**: `rsrch` Agent

## Context
We currently store "Lessons Learned" in a flat Markdown file (`LESSONS_LEARNED.md`). While human-readable, this is hard for agents to query semantically or structurally. An agent facing a "Mermaid syntax error" has to grok the whole file rather than finding a specific known solution.

## Proposed Schema

Transform the flat file into a structured knowledge graph in FalkorDB.

```cypher
(:Topic {
    name: "Mermaid.js",
    category: "Visualization"
})

(:Problem {
    description: "Render timeout on large graphs",
    signature: "TimeoutError: rendering failed" 
})

(:Solution {
    description: "Split graph into Structure and Dependencies views",
    codeSnippet: "..." 
})
```

### Relationships

- **(Problem)-[:RELATED_TO]->(Topic)**
- **(Problem)-[:SOLVED_BY]->(Solution)**
- **(Solution)-[:VERIFIED_IN]->(Interaction)**: Links back to the chat/session where this solution was proven to work.

## Usage Scenarios

1.  **Proactive Assistance**: When `rsrch` sees a stack trace in the terminal output, it queries:
    ```cypher
    MATCH (p:Problem)-[:SOLVED_BY]->(s:Solution)
    WHERE p.signature CONTAINS "TimeoutError"
    RETURN s.description
    ```
    And suggests: *"I see a TimeoutError. We previously solved this by splitting the Mermaid graph."*

2.  **Knowledge Consolidation**: Periodically, `rsrch` can scan `LESSONS_LEARNED.md` and sync it to the graph, or conversely, generate the Markdown file *from* the graph for human consumption.

## Implementation Steps

1.  Extend `rsrch` to parse `LESSONS_LEARNED.md` into FalkorDB nodes.
2.  create `KnowledgeBase` class in `rsrch` that wraps `FalkorClient`.
3.  Add "Retrieve Knowledge" tool to `rsrch` agent capabilities.
