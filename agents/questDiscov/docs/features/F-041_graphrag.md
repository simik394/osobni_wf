# F-041: GraphRAG Contextualization

> **Status**: Draft  
> **Priority**: High  
> **Source**: Vision Doc §4.2

## Problem

Standard RAG retrieves semantically similar document chunks. This fails for:
- **Global queries**: "What are the main themes across all documents?"
- **Connections**: "How do topics A and B relate?"
- **Structure**: Understanding the shape of knowledge, not just content

## Solution

Implement **GraphRAG** (Microsoft pattern) - extract entities/relationships into a graph, detect communities, generate hierarchical summaries.

### How It Differs from Standard RAG

| Aspect | Standard RAG | GraphRAG |
|--------|-------------|----------|
| **Index** | Vector embeddings | Knowledge graph + communities |
| **Query** | Semantic similarity | Graph traversal + community summaries |
| **Global queries** | Poor | Excellent |
| **Cost** | Low (one embedding call) | High (many extraction calls) |
| **Maintenance** | Append-only | Graph updates needed |

### Architecture

```
Documents → Entity Extraction → Graph Construction → Community Detection → Summarization
     ↓
Query → Graph Search → Community Retrieval → Context Assembly → LLM Response
```

## Technical Design

### Index Pipeline

#### 1. Entity Extraction (uses F-002)

```typescript
// Per document chunk
const entities = await extractEntities(chunk);
const relationships = await extractRelationships(chunk);
await graphStore.addEntities(entities);
await graphStore.addRelationships(relationships);
```

#### 2. Community Detection

Using Leiden algorithm:

```typescript
interface Community {
  id: string;
  level: number;           // Hierarchy level (0 = finest)
  entityIds: string[];
  parentCommunityId?: string;
}

async function detectCommunities(
  graph: Graph,
  resolution: number = 1.0
): Promise<Community[]>;
```

#### 3. Community Summarization

```typescript
interface CommunitySummary {
  communityId: string;
  title: string;
  summary: string;
  keyEntities: string[];
  keyRelationships: string[];
}

async function summarizeCommunity(
  community: Community,
  entities: Entity[],
  relationships: Relationship[]
): Promise<CommunitySummary>;
```

### Query Pipeline

```typescript
interface GraphRAGQuery {
  query: string;
  queryType: 'local' | 'global';
  maxCommunities?: number;
  maxEntities?: number;
}

interface GraphRAGResponse {
  answer: string;
  sources: {
    communities: CommunitySummary[];
    entities: Entity[];
    relationships: Relationship[];
  };
  confidence: number;
}

/**
 * Answer query using GraphRAG.
 */
async function queryGraphRAG(
  query: GraphRAGQuery
): Promise<GraphRAGResponse>;
```

### Query Types

**Local Query** (like standard RAG):
1. Embed query
2. Find similar entities
3. Traverse local neighborhood
4. Generate answer

**Global Query** (GraphRAG strength):
1. Retrieve relevant community summaries
2. Map-reduce: Answer per community → Aggregate
3. Can answer "What are the main themes?"

## Use Cases

### Holistic Understanding

> "What are the key controversies in this research field?"

Requires understanding across many documents - community summaries enable this.

### Gap Identification

> "What topics are under-explored?"

Communities with few internal connections or isolated entities.

### Cross-Domain Questions

> "How do findings in biology relate to computer science approaches?"

Community-to-community relationship analysis.

## Integration Points

- **F-001**: Underlying graph storage
- **F-002**: Entity extraction populates graph
- **F-030**: GraphRAG context for hypothesis generation
- **F-040**: Context provider for Planner

## Cost Analysis

GraphRAG is expensive to build (many LLM calls for extraction/summarization) but efficient at query time.

| Phase | Cost |
|-------|------|
| **Indexing** | ~$0.01-0.05 per document (depending on length) |
| **Community summarization** | ~$0.001-0.01 per community |
| **Query (local)** | Similar to standard RAG |
| **Query (global)** | Higher (multiple community lookups) |

**Recommendation**: Build GraphRAG index incrementally as documents are added.

## Verification

1. Index 50+ documents
2. Test local queries: Verify relevant entity retrieval
3. Test global queries: "Summarize main themes" - validate coherence
4. Compare query quality vs standard RAG on same corpus

## Effort Estimate

- **Development**: 1 week
- **Dependencies**: F-001, F-002, Leiden algorithm library
