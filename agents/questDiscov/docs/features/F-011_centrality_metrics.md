# F-011: Centrality Metrics

> **Status**: Draft  
> **Priority**: High  
> **Source**: Vision Doc §2.1.2

## Problem

Not all questions are equally important. Some questions:
- Act as "bridges" connecting different knowledge domains
- Have high information flow through them
- Block many downstream questions if unanswered

## Solution

Compute graph **centrality metrics** to quantify structural importance of each node.

### Metrics

#### 1. Betweenness Centrality

> How many shortest paths pass through this node?

$$C_B(v) = \sum_{s \neq v \neq t} \frac{\sigma_{st}(v)}{\sigma_{st}}$$

Where:
- $\sigma_{st}$ = number of shortest paths from s to t
- $\sigma_{st}(v)$ = number of those paths passing through v

**Interpretation**: High betweenness = "bridge" node connecting different sub-domains.

#### 2. Information Centrality

> How well-positioned is this node for information flow?

Treats graph as electrical network with resistance on edges. Nodes with low "resistance distance" to all others have high information centrality.

**Interpretation**: High info centrality = changes here propagate fastest.

#### 3. Closeness Centrality

> How close is this node to all others?

$$C_C(v) = \frac{n-1}{\sum_{u \neq v} d(v, u)}$$

**Interpretation**: High closeness = can quickly reach/influence entire graph.

#### 4. PageRank (Eigenvector Variant)

> How important are the nodes that link to this?

Used by Google; nodes are important if linked by other important nodes.

## Technical Design

### Module: `centrality.ts`

```typescript
interface CentralityScores {
  betweenness: number;
  information: number;
  closeness: number;
  pagerank: number;
}

/**
 * Compute all centrality metrics for a node.
 */
function computeCentrality(graph: Graph, nodeId: string): CentralityScores;

/**
 * Batch compute for entire graph.
 * Uses FalkorDB GDS algorithms where available.
 */
function computeAllCentrality(graph: Graph): Map<string, CentralityScores>;

/**
 * Rank nodes by specified centrality metric.
 */
function rankByMetric(
  graph: Graph, 
  metric: 'betweenness' | 'information' | 'closeness' | 'pagerank',
  limit?: number
): RankedNode[];
```

### Cypher with GDS

```cypher
// Betweenness centrality
CALL algo.betweenness.stream('Question', 'DEPENDS_ON')
YIELD nodeId, centrality
RETURN gds.util.asNode(nodeId).text AS question, centrality
ORDER BY centrality DESC

// PageRank
CALL algo.pageRank.stream('Question', 'DEPENDS_ON', {iterations: 20, dampingFactor: 0.85})
YIELD nodeId, score
RETURN gds.util.asNode(nodeId).text AS question, score
ORDER BY score DESC
```

## Use Cases

### Strategic Question Selection

> "Which question, if answered, would provide the most value to understanding the entire problem?"

Answer: Highest combined (betweenness × information) centrality.

### Interdisciplinary Bridge Detection

Questions with high betweenness but low clustering connect different "silos" of knowledge.

### Risk Assessment

High-centrality unanswered questions represent major project risk.

## Integration Points

- **F-001**: Operates on knowledge graph
- **F-020**: Combined with entropy for prioritization
- **F-023**: Core input to priority pipeline

## Verification

1. Create known graph topology (star, chain, complete)
2. Verify centrality values match theoretical expectations
3. Benchmark: 1,000 nodes < 5s for full computation

## Effort Estimate

- **Development**: 2 days
- **Dependencies**: F-001, FalkorDB GDS library (optional optimization)
