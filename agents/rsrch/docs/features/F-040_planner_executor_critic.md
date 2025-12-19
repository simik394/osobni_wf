# F-040: Planner-Executor-Critic Framework

> **Status**: Draft  
> **Priority**: High  
> **Source**: Vision Doc §4.1

## Problem

Pure LLM systems hallucinate. Pure symbolic systems are brittle. We need an architecture that combines neural flexibility with symbolic guarantees.

## Solution

Implement a **Planner-Executor-Critic** architecture that separates concerns and provides feedback loops.

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         PLANNER (LLM)                            │
│  - Maintains high-level strategy                                │
│  - Decomposes goals into sub-tasks                              │
│  - Uses Tree of Thoughts / ReAct                                │
│  - Delegates to Executor                                         │
├─────────────────────────────────────────────────────────────────┤
│                    EXECUTOR (Tools/Engines)                      │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐               │
│  │ Search  │ │ Graph   │ │ Python  │ │ Validator│               │
│  │ Tool    │ │ Query   │ │ Execute │ │ (Logic) │               │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘               │
│  - Deterministic operations                                      │
│  - Returns structured results                                    │
├─────────────────────────────────────────────────────────────────┤
│                        CRITIC (LLM/Rules)                        │
│  - Validates Executor outputs                                    │
│  - Checks consistency with goals                                 │
│  - Updates knowledge graph                                       │
│  - Can reject Planner proposals                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Flow

```
1. User provides goal
2. PLANNER decomposes into sub-goals, selects first action
3. EXECUTOR performs action (search, compute, query)
4. CRITIC validates output:
   - Consistent with goal?
   - Logically valid?
   - Novel information?
5. If valid → update knowledge, PLANNER continues
   If invalid → feedback to PLANNER, retry with constraints
6. Loop until goal satisfied or budget exhausted
```

## Technical Design

### Module: `agent-framework.ts`

```typescript
interface AgentConfig {
  plannerModel: string;          // gpt-4o, claude-3.5-sonnet
  criticModel: string;           // Can be lighter model
  maxIterations: number;
  budgetTokens: number;
  tools: Tool[];
}

interface Tool {
  name: string;
  description: string;
  parameters: JSONSchema;
  execute: (params: any) => Promise<ToolResult>;
}

interface AgentState {
  goal: string;
  subGoals: SubGoal[];
  completedActions: Action[];
  knowledge: KnowledgeUpdate[];
  iteration: number;
}

/**
 * Run Planner-Executor-Critic loop.
 */
async function runAgent(
  goal: string,
  initialContext: string[],
  config: AgentConfig
): Promise<AgentResult>;
```

### Executor Tools

| Tool | Description | Type |
|------|-------------|------|
| `graph_query` | Query knowledge graph (Cypher) | Deterministic |
| `web_search` | Search external sources | Stochastic |
| `compute` | Run Python calculations | Deterministic |
| `validate_logic` | Check logical consistency | Deterministic |
| `llm_generate` | Generate hypotheses | Neural |

### Critic Prompting

```markdown
You are a scientific peer reviewer. Evaluate this output:

## Planner's Goal
{goal}

## Executor's Action
{action_description}

## Executor's Output
{output}

## Evaluation Criteria
1. Does output address the goal?
2. Is the information factually grounded?
3. Are there logical inconsistencies?
4. What should the Planner do next?

Respond: ACCEPT, REJECT, or REVISE with explanation.
```

### Safety Constraints

Symbolic rules that Planner cannot override:
- Cannot claim experiment succeeded without Executor running it
- Cannot cite sources not verified by web search
- Cannot add graph edges contradicting existing ones without explicit override

## Use Cases

### Research Automation

```
Goal: "Find promising materials for solid-state batteries"
Planner: "First, understand current limitations"
Executor: web_search("solid state battery challenges 2024")
Critic: "Accept - relevant recent information"
Planner: "Now find candidate materials"
...
```

### Constrained Generation

LLM creativity bounded by symbolic validation.

## Integration Points

- **F-001**: Executor queries/updates graph
- **F-023**: Planner uses priority pipeline for task selection
- **F-030**: Planner uses hypothesis generation
- **F-041**: Planner uses GraphRAG for context

## Verification

1. Define test goal with known solution path
2. Verify agent reaches correct conclusion
3. Measure: # hallucinations caught by Critic
4. Target: <5% hallucination pass-through

## Effort Estimate

- **Development**: 1 week
- **Dependencies**: F-001, F-023, F-030, LLM API
