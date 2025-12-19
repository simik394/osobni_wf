# F-031: GNN Link Prediction

> **Status**: Draft  
> **Priority**: Medium  
> **Source**: Vision Doc §3.3

## Problem

LLMs understand semantics but not graph structure. We need a way to predict missing relationships based purely on topological patterns.

## Solution

Use **Graph Neural Networks (GNN)** for link prediction - predicting likely edges between nodes that don't currently have a direct connection.

### How It Works

1. **Node Embedding**: GNN learns vector representation of each node based on its neighborhood
2. **Edge Scoring**: For candidate edges (u, v), score = similarity(embed(u), embed(v))
3. **Threshold**: High score on non-existing edge → strong signal for new question

### GNN Architectures

| Model | Description | Best For |
|-------|-------------|----------|
| **GraphSAGE** | Aggregates sampled neighbors | Large graphs, inductive |
| **GAT** | Attention over neighbors | Varying importance neighbors |
| **GCN** | Convolutional on graph | Smaller, fixed graphs |
| **R-GCN** | Relational typed edges | Multi-relation KGs |

## Technical Design

### Module: `link-prediction.ts`

```typescript
interface LinkCandidate {
  source: string;
  target: string;
  relationType: string;
  score: number;
  confidence: number;
}

interface ModelConfig {
  architecture: 'graphsage' | 'gat' | 'gcn';
  hiddenDim: number;
  numLayers: number;
  dropout: number;
}

/**
 * Train link prediction model on current graph.
 */
async function trainModel(
  graph: Graph,
  config: ModelConfig
): Promise<TrainedModel>;

/**
 * Predict likelihood of missing edges.
 */
async function predictLinks(
  model: TrainedModel,
  candidatePairs: [string, string][],
  topK?: number
): Promise<LinkCandidate[]>;

/**
 * Suggest questions based on high-probability missing links.
 */
async function suggestQuestionsFromLinks(
  predictions: LinkCandidate[],
  threshold: number = 0.7
): Promise<Question[]>;
```

### Integration with PyTorch Geometric

```python
# Python service (called from TypeScript via subprocess/API)
from torch_geometric.nn import SAGEConv
from torch_geometric.data import Data

class LinkPredictor(torch.nn.Module):
    def __init__(self, in_channels, hidden_channels):
        super().__init__()
        self.conv1 = SAGEConv(in_channels, hidden_channels)
        self.conv2 = SAGEConv(hidden_channels, hidden_channels)
    
    def encode(self, x, edge_index):
        x = self.conv1(x, edge_index).relu()
        x = self.conv2(x, edge_index)
        return x
    
    def decode(self, z, edge_index):
        return (z[edge_index[0]] * z[edge_index[1]]).sum(dim=-1)
```

### Training Data

- **Positive examples**: Existing edges in graph
- **Negative examples**: Random non-edges (or hard negatives)
- **Split**: 80% train, 10% val, 10% test

## Use Cases

### Implicit Relationship Discovery

> "These two concepts have never been directly connected, but the graph structure suggests they should be related."

### Question Generation

High-score missing edge → "Does relationship X exist between A and B?"

### Anomaly Detection

Very low score on existing edge → potentially incorrect/outdated knowledge

## Comparison: GNN vs LLM

| Aspect | GNN | LLM |
|--------|-----|-----|
| **Understands** | Structure, patterns | Semantics, meaning |
| **Cost** | Low (local compute) | High (API calls) |
| **Speed** | Fast (ms) | Slow (seconds) |
| **Explainability** | Hard (embeddings) | Easy (natural language) |
| **Best for** | Structural gaps | Semantic gaps |

**Optimal Strategy**: GNN filters candidates, LLM verbalizes as questions.

## Integration Points

- **F-001**: Operates on knowledge graph
- **F-020**: GNN confidence as uncertainty signal
- **F-030**: GNN candidates → LLM verbalization

## Verification

1. Hold out 10% edges, predict, measure AUC-ROC
2. Target: AUC > 0.85 on test set
3. Measure prediction time: <100ms for 1000 candidates

## Effort Estimate

- **Development**: 4-5 days (requires Python ML pipeline)
- **Dependencies**: F-001, PyTorch Geometric
