# F-001: Knowledge Graph Foundation

> **Status**: Draft  
> **Priority**: High  
> **Source**: Vision Doc §2.1, §4.2, §6.1

## Problem

Research knowledge exists as fragmented notes, documents, and mental models. Without structured representation:
- Dependencies between hypotheses are invisible
- Critical paths cannot be computed
- Redundant/conflicting knowledge cannot be detected

## Solution

Implement a **Directed Acyclic Graph (DAG)** as the foundational data structure for representing research knowledge.

### Node Types

```
(:Hypothesis)     - id, statement, status, confidence, createdAt
(:Question)       - id, text, priority, answered, createdAt
(:DataPoint)      - id, value, source, timestamp
(:Task)           - id, description, status, effort, deadline
(:Entity)         - id, type, name, properties
```

### Edge Types (Relationships)

```
[:DEPENDS_ON]     - Hypothesis → Hypothesis (prerequisite)
[:REQUIRES]       - Task → Question (must answer first)
[:SUPPORTS]       - DataPoint → Hypothesis (evidence)
[:CONTRADICTS]    - DataPoint → Hypothesis (counter-evidence)
[:RELATED_TO]     - Entity → Entity (semantic link)
[:ANSWERS]        - DataPoint → Question (resolution)
```

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `confidence` | float [0,1] | Bayesian certainty estimate |
| `entropy` | float | Information uncertainty |
| `centrality` | float | Structural importance score |
| `criticality` | float | Critical path index |

## Technical Design

### Storage

Extend existing `graph-store.ts` (FalkorDB) with new node/relationship types:

```typescript
interface Hypothesis {
  id: string;
  statement: string;
  status: 'unverified' | 'supported' | 'refuted';
  confidence: number;
  entropy?: number;
  centralityBetweenness?: number;
  centralityInformation?: number;
}

interface Question {
  id: string;
  text: string;
  priority: number;
  answered: boolean;
  hypothesisIds: string[]; // Questions arise from hypotheses
}
```

### Key Operations

| Operation | Description |
|-----------|-------------|
| `addHypothesis()` | Create hypothesis node |
| `addDependency()` | Create DEPENDS_ON edge |
| `getAncestors()` | Find all prerequisite hypotheses |
| `getDescendants()` | Find all dependent hypotheses |
| `getDAGView()` | Return full graph for visualization |
| `detectCycles()` | Validate DAG property |

## Integration Points

- **F-002**: Entity extraction populates nodes
- **F-010**: Topological sorting operates on this graph
- **F-011**: Centrality metrics computed on these nodes
- **F-050**: Obsidian as read/write interface

## Verification

1. Create test graph with 10 hypotheses, 15 dependencies
2. Verify cycle detection throws on circular dependency
3. Verify ancestor/descendant traversal correctness
4. Benchmark: 1000 nodes, 5000 edges < 100ms query

## Effort Estimate

- **Development**: 2-3 days
- **Dependencies**: FalkorDB (already deployed)
