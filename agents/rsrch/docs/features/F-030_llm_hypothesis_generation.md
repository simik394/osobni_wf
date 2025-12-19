# F-030: LLM Hypothesis Generation

> **Status**: Draft  
> **Priority**: High  
> **Source**: Vision Doc §3.1

## Problem

Graph algorithms can prioritize *existing* questions but cannot generate *new* ones. Humans miss connections. We need creative hypothesis generation.

## Solution

Use LLM with **Chain-of-Thought (CoT)** prompting for recursive problem decomposition and hypothesis generation.

### Capabilities

1. **Analogical Reasoning**: "This problem is similar to X, so maybe approach Y works here"
2. **Gap Detection**: Identify missing logical links in knowledge graph
3. **Decomposition**: Break epic problems into sub-questions
4. **Cross-Domain Transfer**: Connect concepts from distant fields

### Chain-of-Thought Decomposition

```
Initial Problem: "Develop a room-temperature superconductor"

CoT Expansion:
1. What are known superconductor mechanisms?
   → BCS theory, high-Tc cuprates, hydrides under pressure
2. What limits current high-Tc materials?
   → Need extreme pressure, complex synthesis
3. What alternative mechanisms exist?
   → Topological superconductivity, unconventional pairing
4. What materials show promise?
   → Generate: "Does layered nickelate LaNiO2 exhibit SC above 200K?"
```

## Technical Design

### Module: `hypothesis-generator.ts`

```typescript
interface GenerationConfig {
  model: string;               // gpt-4o, claude-3.5-sonnet
  maxDepth: number;            // CoT recursion depth
  temperature: number;         // Creativity control
  domainContext: string[];     // Domain-specific seed knowledge
  avoidTopics?: string[];      // Already answered, don't regenerate
}

interface GeneratedHypothesis {
  statement: string;
  reasoning: string;           // How it was derived
  confidence: number;
  suggestedValidation: string;
  relatedNodes: string[];      // Links to existing graph nodes
  noveltyScore: number;        // 0-1, how different from existing
}

/**
 * Generate hypotheses using Chain-of-Thought.
 */
async function generateHypotheses(
  problem: string,
  knowledgeContext: string[],
  config: GenerationConfig
): Promise<GeneratedHypothesis[]>;

/**
 * Identify gaps in knowledge graph and generate filling hypotheses.
 */
async function fillGraphGaps(
  graph: Graph,
  config: GenerationConfig
): Promise<GeneratedHypothesis[]>;
```

### Prompt Template

```markdown
You are a research strategist analyzing an epic problem.

## Current Knowledge
{knowledge_summary}

## Knowledge Graph Structure
Entities: {entities}
Key Gaps: {identified_gaps}

## Problem
{problem_statement}

## Task
Using Chain-of-Thought reasoning:
1. Identify implicit assumptions in current knowledge
2. Find potential missing links between domains
3. Generate 3-5 novel, testable hypotheses
4. For each, explain reasoning chain and suggest validation method

Output as JSON array of hypotheses.
```

### Hallucination Mitigation

> [!WARNING]
> LLMs can generate plausible-sounding but factually wrong hypotheses.

Mitigations:
1. **Grounding Check**: Verify all referenced entities exist in graph
2. **Critic Agent**: Second LLM reviews for logical consistency
3. **Human-in-the-Loop**: Flag low-confidence for review
4. **Fact Verification**: External API check for known facts

## Use Cases

### Early-Stage Exploration

When knowledge graph is sparse, LLM generates seed hypotheses.

### Interdisciplinary Bridging

"Find connections between materials science and immunology"

### Brainstorming Sessions

Rapid generation of possibilities for human filtering.

## Integration Points

- **F-001**: Writes generated hypotheses to graph
- **F-002**: Uses same extraction for structuring output
- **F-040**: Planner role in Planner-Executor-Critic
- **F-041**: Uses GraphRAG context

## Verification

1. Generate hypotheses for known domain
2. Expert review: Measure % that are sensible
3. Novelty check: % not already in knowledge base
4. Target: >70% sensible, >50% novel

## Effort Estimate

- **Development**: 2-3 days
- **Dependencies**: F-001, F-002, LLM API access
