# F-023: Question Priority Pipeline

> **Status**: Draft  
> **Priority**: High  
> **Source**: Vision Doc §6.2 Step 3

## Problem

Multiple metrics exist for prioritizing questions:
- Entropy (uncertainty)
- Centrality (structural importance)
- Criticality (schedule impact)
- VoI (decision value)
- Cost (effort to answer)

We need a unified scoring system that combines all factors.

## Solution

Implement a **composite priority pipeline** that aggregates multiple signals into a single priority score.

### Priority Formula

$$\text{Priority}(q) = \frac{w_1 \cdot H(q) + w_2 \cdot C_B(q) + w_3 \cdot C_I(q) + w_4 \cdot \text{Crit}(q) + w_5 \cdot \text{VoI}(q)}{\text{Cost}(q)}$$

Where:
- $H(q)$ = Entropy (normalized 0-1)
- $C_B(q)$ = Betweenness centrality (normalized)
- $C_I(q)$ = Information centrality (normalized)
- $Crit(q)$ = Criticality index (probability on critical path)
- $VoI(q)$ = Value of Information
- $Cost(q)$ = Effort/resources to answer
- $w_i$ = Configurable weights

## Technical Design

### Module: `priority-pipeline.ts`

```typescript
interface PriorityWeights {
  entropy: number;
  betweennessCentrality: number;
  informationCentrality: number;
  criticalityIndex: number;
  valueOfInformation: number;
}

interface PriorityConfig {
  weights: PriorityWeights;
  normalization: 'minmax' | 'zscore' | 'none';
  topK?: number;
  thresholdScore?: number;
}

interface PrioritizedQuestion {
  question: Question;
  score: number;
  components: {
    entropy: number;
    centrality: number;
    criticality: number;
    voi: number;
    cost: number;
  };
  rank: number;
}

/**
 * Compute priority scores for all questions.
 */
async function computePriorities(
  questions: Question[],
  config: PriorityConfig
): Promise<PrioritizedQuestion[]>;

/**
 * Get top K highest priority questions.
 */
async function getTopPriorities(
  graph: Graph,
  k: number,
  config?: Partial<PriorityConfig>
): Promise<PrioritizedQuestion[]>;
```

### Normalization

Metrics have different scales. Normalize before combining:

```typescript
function normalizeMinMax(values: number[]): number[] {
  const min = Math.min(...values);
  const max = Math.max(...values);
  return values.map(v => (v - min) / (max - min || 1));
}

function normalizeZScore(values: number[]): number[] {
  const mean = values.reduce((a, b) => a + b) / values.length;
  const std = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length);
  return values.map(v => (v - mean) / (std || 1));
}
```

### Default Weights

Based on vision document recommendations:

```typescript
const DEFAULT_WEIGHTS: PriorityWeights = {
  entropy: 0.20,              // What don't we know?
  betweennessCentrality: 0.25, // Strategic importance
  informationCentrality: 0.15, // Information flow
  criticalityIndex: 0.25,      // Schedule risk
  valueOfInformation: 0.15     // Decision impact
};
```

### Pipeline Stages

```
1. Collect Questions     → All unanswered from graph
2. Filter Eligible       → Respect topological constraints
3. Compute Components    → Call F-011, F-012, F-020, F-021
4. Normalize             → Scale to comparable ranges
5. Apply Weights         → Weighted sum
6. Divide by Cost        → Cost-efficiency adjustment
7. Rank & Return         → Top-K with explanations
```

## CLI Command

```bash
rsrch questions prioritize [--top=5] [--weights=0.2,0.25,0.15,0.25,0.15]
```

## Output Format

```json
{
  "priorities": [
    {
      "rank": 1,
      "question": "Does compound X remain stable above 400°C?",
      "score": 0.847,
      "explanation": "High criticality (0.89) - blocks 12 downstream tasks. High betweenness (0.76) - bridges synthesis and testing domains.",
      "components": {
        "entropy": 0.65,
        "centrality": 0.76,
        "criticality": 0.89,
        "voi": 0.42,
        "cost": 1.5
      }
    }
  ]
}
```

## Integration Points

- **F-011**: Centrality scores
- **F-012**: Criticality indices  
- **F-020**: Entropy values
- **F-021**: VoI calculations
- **F-050**: Output to Obsidian Research_Priorities.md

## Verification

1. Create test graph with known optimal priority order
2. Verify pipeline ranking matches expected
3. Test weight sensitivity: changing weights changes ranking
4. Performance: 1000 questions < 5s end-to-end

## Effort Estimate

- **Development**: 2 days (integration/aggregation)
- **Dependencies**: F-011, F-012, F-020, F-021 (all)
