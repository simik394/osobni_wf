# F-042: AI Scientist Loop

> **Status**: Draft  
> **Priority**: Low  
> **Source**: Vision Doc §4.3

## Problem

Current systems require human-in-the-loop for idea evaluation. This creates a bottleneck and limits exploration velocity.

## Solution

Implement an **AI Scientist** closed-loop system where ideas are automatically generated, tested, and peer-reviewed by AI.

### Full Automation Loop

```
┌─────────────────────────────────────────────────────────────────┐
│                     AI SCIENTIST LOOP                            │
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │    IDEA      │───►│ EXPERIMENT   │───►│  ANALYSIS    │      │
│  │  GENERATION  │    │   DESIGN     │    │  & REPORT    │      │
│  └──────────────┘    └──────────────┘    └──────────────┘      │
│         ▲                                        │               │
│         │            ┌──────────────┐            │               │
│         └────────────│ PEER REVIEW  │◄───────────┘               │
│                      │ (AI Critic)  │                            │
│                      └──────────────┘                            │
│                            │                                     │
│                            ▼                                     │
│                    Accept / Reject / Revise                      │
└─────────────────────────────────────────────────────────────────┘
```

### Stages

1. **Idea Generation**: LLM generates research ideas based on knowledge graph gaps
2. **Experiment Design**: Convert idea to executable experiment (code, simulation, search)
3. **Execution**: Run experiment (Python, API calls, data collection)
4. **Analysis & Report**: Generate findings document
5. **Peer Review**: Separate LLM instance critiques findings
6. **Feedback**: Rejected ideas inform next generation (evolutionary pressure)

## Technical Design

### Module: `ai-scientist.ts`

```typescript
interface ScientistConfig {
  ideaModel: string;           // Model for idea generation
  reviewModel: string;         // Model for peer review
  maxIterations: number;
  acceptanceThreshold: number; // Review score to accept
  evolutionEnabled: boolean;   // Use idea evolution
}

interface Idea {
  id: string;
  hypothesis: string;
  novelty: number;
  feasibility: number;
  potentialImpact: number;
  parentIdeas?: string[];      // For evolutionary tracking
}

interface ExperimentResult {
  ideaId: string;
  success: boolean;
  findings: string;
  data: any;
  executionLog: string[];
}

interface PeerReview {
  scores: {
    novelty: number;
    validity: number;
    clarity: number;
    significance: number;
  };
  overallScore: number;
  decision: 'accept' | 'reject' | 'revise';
  feedback: string;
}

/**
 * Run one iteration of the AI Scientist loop.
 */
async function runScientistIteration(
  knowledgeContext: string[],
  config: ScientistConfig
): Promise<{
  ideas: Idea[];
  results: ExperimentResult[];
  reviews: PeerReview[];
  acceptedIdeas: Idea[];
}>;
```

### Idea Evolution

Apply evolutionary algorithms to idea generation:

```typescript
interface IdeaEvolution {
  // Mutation: Modify existing idea
  mutate(idea: Idea): Idea;
  
  // Crossover: Combine two ideas
  crossover(idea1: Idea, idea2: Idea): Idea;
  
  // Selection: Keep best ideas based on review scores
  select(ideas: Idea[], reviews: PeerReview[], k: number): Idea[];
}
```

### Peer Review Prompt

```markdown
You are a rigorous scientific peer reviewer. Evaluate this research finding.

## Hypothesis
{hypothesis}

## Experiment Design
{experiment_description}

## Results
{results}

## Evaluation Criteria
Score 1-10 on each:
1. **Novelty**: Is this new and interesting?
2. **Validity**: Is the methodology sound?
3. **Clarity**: Is the explanation clear?
4. **Significance**: Does this matter?

Provide:
- Scores (1-10 each)
- Overall decision: ACCEPT (>=7 avg), REVISE (5-7), REJECT (<5)
- Specific feedback for improvement
```

## Use Cases

### Rapid Hypothesis Screening

Run 100 ideas through the loop overnight, wake up to top 5 validated candidates.

### Literature Gap Exploration

"Generate and test 50 ideas about connections between fields X and Y"

### Simulation Studies

For domains where experiments can be coded (math, CS, simulations).

## Current Limitations

> [!CAUTION]
> This is experimental. Current AI cannot replace real laboratory experiments.

**Safe domains**: Mathematical proofs, code testing, literature analysis, simulations
**Unsafe domains**: Claims about physical reality without actual experiments

## Integration Points

- **F-001**: Updates knowledge graph with validated findings
- **F-030**: Idea generation module
- **F-040**: Builds on Planner-Executor-Critic

## Verification

1. Run on mathematical domain (can verify correctness)
2. Measure: % of accepted ideas that are truly novel
3. Compare to random idea generation baseline
4. Target: 3x improvement in valid idea discovery rate

## Effort Estimate

- **Development**: 2 weeks (advanced, experimental)
- **Dependencies**: F-030, F-040, Python execution sandbox
