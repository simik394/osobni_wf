# F-002: Entity & Relationship Extraction

> **Status**: Draft  
> **Priority**: High  
> **Source**: Vision Doc §4.2, §6.2

## Problem

Building a knowledge graph manually is expensive and doesn't scale. Documents contain implicit entities and relationships that need automated extraction.

## Solution

Use LLM-powered extraction to transform unstructured documents into graph nodes and edges.

### Extraction Pipeline

```
Document → Chunking → LLM Extraction → Entity Resolution → Graph Insertion
```

### Extraction Prompt Template

```
Given the following text, extract:
1. ENTITIES: Named concepts, hypotheses, methods, materials
2. RELATIONSHIPS: Causal, prerequisite, part-of, supports, contradicts

Output as JSON:
{
  "entities": [{"id": "...", "type": "...", "name": "...", "properties": {...}}],
  "relationships": [{"source": "...", "target": "...", "type": "...", "confidence": ...}]
}

Text:
{chunk}
```

### Relationship Types

| Type | Meaning | Example |
|------|---------|---------|
| `CAUSES` | A causes B | "Heat treatment → Increased hardness" |
| `REQUIRES` | A needs B first | "Synthesis → Precursor preparation" |
| `SUPPORTS` | A is evidence for B | "Experiment result → Hypothesis" |
| `CONTRADICTS` | A refutes B | "Counter-example → Theory" |
| `PART_OF` | A is component of B | "Step → Process" |
| `RELATED_TO` | Semantic association | Fallback for unclear relations |

## Technical Design

### Module: `entity-extractor.ts`

```typescript
interface ExtractionResult {
  entities: Entity[];
  relationships: Relationship[];
  sourceDocId: string;
  confidence: number;
}

async function extractFromDocument(
  docPath: string,
  options: {
    chunkSize?: number;
    llmModel?: string;
    confidenceThreshold?: number;
  }
): Promise<ExtractionResult>;
```

### Entity Resolution

Handle duplicates and coreferences:
1. **Exact match**: Same normalized name
2. **Fuzzy match**: Levenshtein distance < 3
3. **Semantic match**: Embedding similarity > 0.9

Merge strategy: Update existing node, accumulate evidence.

### GraphRAG Integration

Follows Microsoft GraphRAG pattern:
1. Extract entities per chunk
2. Build global entity graph
3. Apply Leiden community detection
4. Generate hierarchical summaries per community

## Integration Points

- **F-001**: Writes extracted entities to knowledge graph
- **F-030**: Uses same LLM infrastructure  
- **F-041**: Full GraphRAG builds on this

## Cost Analysis

| Model | Cost per 1K tokens | Speed | Quality |
|-------|-------------------|-------|---------|
| GPT-4o-mini | ~$0.00015 | Fast | Good |
| Claude 3.5 Haiku | ~$0.00025 | Fast | Better |
| GPT-4o | ~$0.005 | Slower | Best |

**Recommendation**: Use GPT-4o-mini for bulk extraction, GPT-4o for validation.

## Verification

1. Extract from 10 sample documents
2. Manual spot-check 50 relationships
3. Measure precision/recall vs human annotation
4. Target: Precision > 0.8, Recall > 0.7

## Effort Estimate

- **Development**: 3-4 days
- **Dependencies**: F-001 (Knowledge Graph), LLM API access
