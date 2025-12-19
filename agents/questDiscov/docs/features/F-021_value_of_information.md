# F-021: Value of Information Calculation

> **Status**: Draft  
> **Priority**: High  
> **Source**: Vision Doc §2.2.2

## Problem

Entropy tells us what we don't know. It doesn't tell us if knowing would help. We need to measure **impact** of information, not just quantity.

## Solution

Implement **Value of Information (VoI)** from Bayesian Decision Theory.

### Formula

$$VoI(e) = \mathbb{E}_y \left[ \max_a \mathbb{E}_\theta [U(a, \theta) | y, e] \right] - \max_a \mathbb{E}_\theta [U(a, \theta)]$$

Where:
- $e$ = experiment/question
- $y$ = possible outcomes
- $a$ = available actions
- $\theta$ = uncertain state of world
- $U$ = utility function

**Translation**: VoI = Expected value with new information − Expected value without it

### Simplified Approach

For research question prioritization:

$$VoI(q) = P(q\text{ changes optimal action}) \times \Delta U_{\text{if changed}}$$

If answering question $q$ wouldn't change what we do next, VoI = 0.

## Technical Design

### Module: `value-of-information.ts`

```typescript
interface VoIAnalysis {
  questionId: string;
  possibleOutcomes: Outcome[];
  expectedValueWithInfo: number;
  expectedValueWithoutInfo: number;
  voi: number;
  costToAnswer: number;
  roiRatio: number;  // VoI / cost
}

/**
 * Compute VoI for a single question.
 */
async function computeVoI(
  question: Question,
  currentBeliefs: Belief[],
  utilityFunction: UtilityFunction,
  decisionSpace: Action[]
): Promise<VoIAnalysis>;

/**
 * Rank questions by VoI-to-cost ratio.
 */
function rankByVoI(
  questions: Question[],
  context: VoIContext
): RankedQuestion[];
```

### Utility Functions

```typescript
type UtilityFunction = (projectState: ProjectState) => number;

// Example: Time to completion
const timeUtility: UtilityFunction = (state) => -state.estimatedCompletionDays;

// Example: Risk-adjusted
const riskUtility: UtilityFunction = (state) => 
  state.successProbability * state.potentialValue - state.costIncurred;
```

### Practical Heuristics

When full Bayesian computation is too expensive:

| Heuristic | Formula | When to Use |
|-----------|---------|-------------|
| **Blocking Value** | VoI ∝ (nodes blocked by question) | Task dependencies |
| **Variance Reduction** | VoI ∝ expected σ² reduction | Duration estimation |
| **Decision Sensitivity** | VoI ∝ P(optimal action changes) | Strategy decisions |

## Use Cases

### Investment Decision

> "Should we spend $10,000 on this experiment?"

If VoI > $10,000, the expected value from the information exceeds the cost.

### Question Triage

> "We have 50 questions. Which 5 should we answer today?"

Rank by VoI/cost ratio, select top 5.

### Perfect vs Imperfect Information

Compute VoI assuming perfect answer vs uncertain/partial answer.

## Integration Points

- **F-011**: Centrality affects blocking value
- **F-012**: Critical path affects variance reduction value
- **F-020**: Combined with entropy (high entropy + high VoI = priority)
- **F-023**: Primary input to priority pipeline

## Verification

1. Create toy decision problem with known VoI
2. Verify computed VoI matches analytical solution
3. Test ranking stability with noisy estimates
4. A/B test: VoI-based vs random selection should show 2x+ efficiency

## Effort Estimate

- **Development**: 3-4 days (complex reasoning)
- **Dependencies**: F-011, F-012, F-020
