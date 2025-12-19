# F-012: Critical Path Analysis

> **Status**: Draft  
> **Priority**: Medium  
> **Source**: Vision Doc §1.2, §2.3

## Problem

Traditional Critical Path Method (CPM) assumes deterministic task durations. Research tasks have high variance - a literature review might take 2 hours or 2 weeks depending on what's found.

## Solution

Implement **PERT (Program Evaluation and Review Technique)** with **Monte Carlo simulation** for probabilistic scheduling.

### PERT Estimation

For each task, estimate three durations:
- **O** (Optimistic): Best case
- **M** (Most Likely): Expected case  
- **P** (Pessimistic): Worst case

```
Expected Duration: μ = (O + 4M + P) / 6
Standard Deviation: σ = (P - O) / 6
Variance: σ² = ((P - O) / 6)²
```

### Monte Carlo Simulation

1. For each task, sample duration from Beta distribution
2. Compute critical path for this scenario
3. Repeat 1,000-10,000 times
4. Calculate **Criticality Index** = P(task on critical path)

## Technical Design

### Data Model

```typescript
interface TaskEstimate {
  id: string;
  optimistic: number;    // hours
  mostLikely: number;
  pessimistic: number;
  dependencies: string[];
}

interface SimulationResult {
  expectedCompletion: number;
  completionVariance: number;
  criticalityIndices: Map<string, number>;
  p50Duration: number;
  p90Duration: number;
  p99Duration: number;
}
```

### Module: `critical-path.ts`

```typescript
/**
 * Compute deterministic critical path (CPM).
 */
function computeCriticalPath(tasks: TaskEstimate[]): {
  path: string[];
  duration: number;
};

/**
 * Run Monte Carlo simulation for probabilistic analysis.
 */
function runMonteCarloSimulation(
  tasks: TaskEstimate[],
  iterations: number = 10000
): SimulationResult;

/**
 * Identify tasks with high criticality AND high variance.
 * These are the biggest risks to project timeline.
 */
function identifyRiskNodes(result: SimulationResult): RiskAnalysis[];
```

### Visualization

Output format compatible with Gantt/timeline tools:
- Expected timeline with confidence intervals
- Highlighted critical path
- Color-coded risk levels

## Use Cases

### Project Duration Estimation

> "When will the research project complete?"

Answer: "50% chance by March 15, 90% chance by April 1"

### Risk-Based Question Prioritization

Questions with:
- **High criticality index** (often on critical path)
- **High variance** (uncertain duration)

...should be investigated first to reduce uncertainty.

### Schedule Contingency Planning

Identify which tasks most affect the P90 completion date.

## Integration Points

- **F-010**: Builds on topological order
- **F-022**: Monte Carlo is the simulation engine
- **F-023**: Criticality index feeds priority pipeline

## Verification

1. Create deterministic test case, verify CPM matches
2. Run simulation, verify distribution properties
3. Validate criticality indices sum correctly
4. Benchmark: 100 tasks, 10,000 iterations < 10s

## Effort Estimate

- **Development**: 2-3 days
- **Dependencies**: F-010 (Topological Sorting)
