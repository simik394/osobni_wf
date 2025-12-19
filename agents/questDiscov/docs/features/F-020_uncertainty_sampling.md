# F-020: Entropy/Uncertainty Sampling

> **Status**: Draft  
> **Priority**: High  
> **Source**: Vision Doc §2.2.1

## Problem

Not all uncertain knowledge is worth investigating. We need to distinguish:
- **Valuable uncertainty**: Resolving it advances the project
- **Noise**: Inherently random, no value in investigating

## Solution

Implement **Active Learning** strategies based on Shannon entropy to select the most informative questions.

### Shannon Entropy

For a binary outcome (hypothesis confirmed/refuted):

$$H(p) = -p \log_2(p) - (1-p) \log_2(1-p)$$

- H(0.5) = 1.0 (maximum uncertainty)
- H(0.9) = 0.47 (fairly certain)
- H(0.99) = 0.08 (very certain)

### Sampling Strategies

| Strategy | Description | When to Use |
|----------|-------------|-------------|
| **Entropy Sampling** | Select highest entropy nodes | Early exploration |
| **Margin Sampling** | Select smallest margin between top-2 predictions | Binary decisions |
| **Query-by-Committee** | Select where multiple models disagree | When diverse models available |
| **Expected Model Change** | Select where gradient is largest | For active fine-tuning |

## Technical Design

### Module: `uncertainty.ts`

```typescript
/**
 * Compute entropy of a probability distribution.
 */
function entropy(probabilities: number[]): number;

/**
 * Estimate uncertainty for a hypothesis using LLM.
 */
async function estimateUncertainty(
  hypothesis: string,
  context: string[],  // Related knowledge
  model?: string
): Promise<{
  probability: number;  // P(hypothesis is true)
  entropy: number;
  confidence: number;   // Model's meta-confidence
}>;

/**
 * Rank hypotheses by uncertainty for active learning.
 */
function rankByUncertainty(
  hypotheses: Hypothesis[],
  strategy: 'entropy' | 'margin' | 'committee'
): RankedHypothesis[];
```

### LLM Uncertainty Estimation

```
Given the current knowledge base and hypothesis, estimate:
1. Probability that hypothesis is TRUE (0.0-1.0)
2. Your confidence in this estimate (0.0-1.0)
3. Key evidence for/against

Hypothesis: "{hypothesis}"

Context:
{context}

Respond as JSON: {"probability": ..., "confidence": ..., "reasoning": "..."}
```

### Avoiding "Noisy TV" Problem

Pure entropy sampling can focus on inherently unpredictable phenomena. Mitigations:

1. **VoI weighting**: Multiply entropy by value of resolving (see F-021)
2. **Relevance filtering**: Only consider hypotheses connected to goal
3. **Confidence thresholding**: Ignore if LLM confidence < 0.3

## Integration Points

- **F-001**: Operates on hypothesis nodes
- **F-021**: Combined with VoI for final ranking
- **F-023**: Core input to priority pipeline
- **F-030**: Uses LLM for probability estimation

## Verification

1. Create synthetic dataset with known true probabilities
2. Verify entropy calculations match theory
3. Compare sampling strategies on convergence speed
4. Measure vs random baseline: Should reach target accuracy 30%+ faster

## Effort Estimate

- **Development**: 2 days
- **Dependencies**: F-001, LLM API access
