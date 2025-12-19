# F-010: Topological Sorting & DAG Analysis

> **Status**: Draft  
> **Priority**: High  
> **Source**: Vision Doc §2.1.1

## Problem

Questions and hypotheses have logical dependencies. Attempting to answer a question before its prerequisites leads to wasted effort or incorrect conclusions.

## Solution

Apply **Topological Sorting** to produce a valid execution order that respects all dependency constraints.

### Algorithm: Kahn's Algorithm

```
1. Compute in-degree for all nodes
2. Add all nodes with in-degree 0 to queue
3. While queue not empty:
   a. Remove node n from queue
   b. Add n to sorted output
   c. For each neighbor m of n:
      - Decrease in-degree of m by 1
      - If in-degree of m is 0, add to queue
4. If output contains all nodes → valid DAG
   Else → cycle detected (error)
```

**Complexity**: O(V + E) where V = nodes, E = edges

### Priority-Aware Sorting

Extend basic topological sort with priority weights:

```typescript
interface PrioritizedNode {
  id: string;
  priority: number;  // Higher = more urgent
  inDegree: number;
}

// Use priority queue instead of simple queue
// Among nodes with in-degree 0, select highest priority
```

## Technical Design

### Module: `graph-algorithms.ts`

```typescript
/**
 * Returns nodes in valid execution order.
 * Throws if cycle detected.
 */
function topologicalSort(
  graph: Graph,
  options?: {
    priorityField?: string;  // Node property for tie-breaking
    startNodes?: string[];   // Optional subset to start from
  }
): string[];

/**
 * Returns nodes that have no unsatisfied dependencies.
 * These are "ready to work on now".
 */
function getReadyNodes(graph: Graph): Node[];

/**
 * Validates DAG property.
 */
function detectCycles(graph: Graph): CycleInfo | null;
```

### Cypher Queries

```cypher
// Get topological order (via APOC or custom)
MATCH path = (start:Question)-[:DEPENDS_ON*]->(end:Question)
WHERE NOT (start)<-[:DEPENDS_ON]-()
RETURN nodes(path)

// Get ready questions (no unresolved dependencies)
MATCH (q:Question)
WHERE NOT EXISTS {
  MATCH (q)-[:DEPENDS_ON]->(dep:Question)
  WHERE dep.answered = false
}
RETURN q
```

## Use Cases

### 1. Research Roadmap Generation

```
Given 50 research questions, produce optimal learning path:
Q1: "What is X?" → Q5: "How does X affect Y?" → Q12: "Can we optimize X-Y?"
```

### 2. Blocking Question Detection

Identify which unanswered questions block the most downstream work.

### 3. Parallel Work Identification

Find independent branches that can be worked on simultaneously.

## Integration Points

- **F-001**: Operates on hypothesis/question graph
- **F-012**: Critical path analysis builds on this
- **F-023**: Priority pipeline uses topological constraints

## Verification

1. Create graph with known valid order
2. Verify topological sort matches expected output
3. Insert cycle, verify detection
4. Benchmark: 10,000 nodes, 50,000 edges < 500ms

## Effort Estimate

- **Development**: 1-2 days
- **Dependencies**: F-001 (Knowledge Graph)
