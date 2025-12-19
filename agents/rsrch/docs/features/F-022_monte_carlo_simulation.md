# F-022: Monte Carlo Simulation

> **Status**: Draft  
> **Priority**: Medium  
> **Source**: Vision Doc §2.3

## Problem

Research projects have uncertainty at multiple levels:
- Individual task durations
- Success/failure probabilities
- Branching paths based on outcomes

Single-point estimates hide risk. We need to model the **distribution** of outcomes.

## Solution

Implement Monte Carlo simulation to sample thousands of possible project trajectories and compute statistics.

### Algorithm

```
for i in 1..N_iterations:
    scenario = {}
    for task in tasks:
        # Sample duration from PERT distribution
        duration = sample_beta(task.O, task.M, task.P)
        # Sample success probability
        success = random() < task.successProb
        scenario[task.id] = {duration, success}
    
    # Compute metrics for this scenario
    critical_path = compute_critical_path(scenario)
    completion_time = sum(critical_path.durations)
    
    record(completion_time, critical_path)

# Aggregate results
return {
    p50: percentile(completion_times, 50),
    p90: percentile(completion_times, 90),
    criticality_indices: count(task in critical_paths) / N
}
```

## Technical Design

### Module: `monte-carlo.ts`

```typescript
interface SimulationConfig {
  iterations: number;          // 1000-100000
  randomSeed?: number;         // For reproducibility
  confidenceLevel: number;     // 0.90, 0.95, 0.99
}

interface TaskDistribution {
  id: string;
  type: 'pert' | 'triangular' | 'normal' | 'lognormal';
  params: {
    O?: number;  // Optimistic
    M?: number;  // Most likely
    P?: number;  // Pessimistic
    mean?: number;
    stddev?: number;
  };
  successProbability?: number;  // 0-1, default 1.0
  dependencies: string[];
}

interface SimulationResult {
  iterations: number;
  completionTime: {
    mean: number;
    stddev: number;
    percentiles: Map<number, number>;  // p50, p90, p95, p99
  };
  criticalityIndices: Map<string, number>;
  sensitivityAnalysis: SensitivityResult[];
}

/**
 * Run Monte Carlo simulation on project schedule.
 */
function runSimulation(
  tasks: TaskDistribution[],
  config: SimulationConfig
): SimulationResult;

/**
 * Tornado diagram: Which tasks most affect completion?
 */
function sensitivityAnalysis(result: SimulationResult): TornadoData;
```

### PERT Beta Distribution Sampling

```typescript
function samplePERT(O: number, M: number, P: number): number {
  // Transform PERT to Beta distribution
  const alpha = 1 + 4 * (M - O) / (P - O);
  const beta = 1 + 4 * (P - M) / (P - O);
  
  // Sample from Beta(alpha, beta)
  const x = betaDistribution.sample(alpha, beta);
  
  // Scale to [O, P]
  return O + x * (P - O);
}
```

## Use Cases

### Risk-Aware Scheduling

> "What's the 90th percentile completion date?"

Monte Carlo provides confidence intervals, not just point estimates.

### Resource Allocation

Identify tasks where reducing variance has highest impact on schedule.

### Scenario Planning

> "What if this key hypothesis is wrong?"

Condition simulation on specific outcomes to explore branches.

## Integration Points

- **F-012**: Critical path analysis uses this
- **F-021**: VoI calculations sample from scenarios
- **F-023**: Criticality indices feed priority pipeline

## Verification

1. Compare simulated mean to analytical PERT mean (should match)
2. Verify percentile calculations with known distributions
3. Check criticality indices sum to >= 1.0 (valid)
4. Benchmark: 10,000 iterations on 100 tasks < 5s

## Effort Estimate

- **Development**: 2 days
- **Dependencies**: None (foundational)
