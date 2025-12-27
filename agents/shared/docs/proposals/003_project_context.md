# Proposal 003: FalkorDB Implementation Plan - Project Context (mapObsi)

**Status**: Proposed
**Date**: 2025-12-27
**Target System**: `falkor-client` (@agents/shared) & `librarian`

## Context
Agents currently operate in a vacuum regarding the codebase structure. While `librarian` scans the Obsidian vault and code files into FalkorDB, the *active sessions* don't automatically link to these nodes. An agent debugging `server.ts` doesn't "know" it's working on the node `(:File {path: '.../server.ts'})` that is part of `(:Project {name: 'angrav'})`.

## Proposed Schema

Link dynamic `Sessions` to static `Project` and `File` nodes.

```cypher
(:Session)-[:OPERATES_ON]->(:Project)
(:Interaction)-[:MODIFIED]->(:File)
(:Interaction)-[:VIEWED]->(:File)
```

### Relationships

- **(Session)-[:OPERATES_ON]->(Project)**: Defines the scope of the session.
- **(Session)-[:MODIFIED]->(File)**: Direct link for "Self-healing" logic (which files broke the build?).
- **(Interaction)-[:MODIFIED]->(:File)**: Detailed history of *when* and *why* a file changed.
- **(Interaction)-[:VIEWED]->(:File)**: Read access history.

## Usage Scenarios

1.  **Self-Healing**: If a build fails, the agent can query:
    ```cypher
    MATCH (s:Session {id: $sessionId})-[:MODIFIED]->(f:File)
    RETURN f.path
    ```
    To immediately identify *what changed* in this session that might have caused the error.

2.  **Context Loading**: When switching to a project "angrav", the agent can load key architectural files by querying the `(:Project {name: 'angrav'})-[:CONTAINS]->(:File {important: true})`.

3.  **Impact Analysis**: Before modifying a file, checking:
    ```cypher
    MATCH (f:File {path: $path})<-[:IMPORTS]-(dependent:File)
    RETURN dependent.path
    ```
    (Note: `IMPORTS` edges are already created by the `visualizing-external-dependencies` workflow).

## Implementation Steps

1.  Update `FalkorClient` with `trackFileInteraction(sessionId, filePath, type: 'view'|'modify')`.
2.  Hook into `angrav` and `rsrch` tool execution layer to automatically call `trackFileInteraction` when file tools are used.
