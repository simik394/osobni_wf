# F-032: RL Graph Navigation

> **Status**: Draft  
> **Priority**: Low  
> **Source**: Vision Doc §3.2

## Problem

Finding relevant multi-hop connections in a knowledge graph is combinatorially complex. We need agents that learn efficient navigation strategies.

## Solution

Use **Reinforcement Learning (RL)** to train agents that navigate the knowledge graph to find relevant paths and connections.

### Multi-hop Reasoning

```
Start: "Room temperature superconductor"
Goal: Find materials with high Tc

Agent actions:
1. Move to neighbor: "high-temperature superconductors" (follows RELATED_TO)
2. Move to neighbor: "cuprates" (follows IS_TYPE_OF)  
3. Move to neighbor: "YBCO" (follows EXAMPLE)
4. Move to neighbor: "123 K" (follows HAS_Tc)

Result: Found relevant path in 4 hops
```

### RL Formulation

- **State**: Current node + path history + goal embedding
- **Actions**: Available edges from current node
- **Reward**: +1 for reaching goal, -0.01 per step (efficiency), +0.5 for partial matches
- **Policy**: Neural network mapping state → action probabilities

## Technical Design

### Module: `rl-navigator.ts`

```typescript
interface NavigationTask {
  startNode: string;
  goalDescription: string;       // Natural language
  goalNodes?: string[];          // Or specific target nodes
  maxHops: number;
}

interface PathResult {
  path: string[];
  reward: number;
  explanation: string;
}

interface AgentConfig {
  architecture: 'deeppath' | 'minerva' | 'multikr';
  hiddenDim: number;
  historyLength: number;
  explorationRate: number;
}

/**
 * Train RL agent on graph navigation tasks.
 */
async function trainNavigator(
  graph: Graph,
  trainingTasks: NavigationTask[],
  config: AgentConfig
): Promise<TrainedNavigator>;

/**
 * Find relevant paths using trained agent.
 */
async function findPaths(
  navigator: TrainedNavigator,
  task: NavigationTask,
  numPaths: number = 5
): Promise<PathResult[]>;
```

### Hierarchical RL (HRL)

For long-horizon problems, use two-level hierarchy:

```
Meta-Controller (Manager):
  - Generates sub-goals: "First understand synthesis methods"
  - Operates on abstracted graph (communities)

Controller (Worker):
  - Achieves sub-goals via atomic actions
  - Operates on full graph
```

### Training with REINFORCE

```python
# Simplified policy gradient update
for episode in training_episodes:
    trajectory = agent.rollout(start, goal)
    reward = compute_reward(trajectory, goal)
    
    # Policy gradient
    loss = -log_prob(trajectory) * reward
    optimizer.step(loss)
```

## Use Cases

### Causal Chain Discovery

> "How does factor A eventually influence outcome Z through intermediaries?"

Agent finds multi-hop causal paths.

### Cross-Domain Exploration

> "Connect genomics knowledge to materials science"

Agent discovers non-obvious bridges.

### Adaptive Search Strategy

Unlike BFS/DFS with fixed heuristics, RL learns domain-specific search strategies.

## Integration Points

- **F-001**: Navigates knowledge graph
- **F-030**: Discovered paths → LLM for question formulation
- **F-040**: Navigator as specialized Executor tool

## Comparison: RL vs Graph Algorithms

| Aspect | RL Navigation | BFS/DFS |
|--------|--------------|---------|
| **Adaptability** | Learns patterns | Fixed heuristic |
| **Training Cost** | High (many episodes) | None |
| **Inference** | Fast (learned policy) | Exhaustive |
| **Generalization** | Can transfer | Per-query |

## Verification

1. Train on synthetic graphs with known paths
2. Measure: Path length vs optimal, success rate
3. Test generalization to unseen queries
4. Target: Within 1.5x optimal path length, >80% success

## Effort Estimate

- **Development**: 1-2 weeks (complex ML pipeline)
- **Dependencies**: F-001, RL framework (stable-baselines, Ray RLlib)
- **Hardware**: GPU recommended for training
