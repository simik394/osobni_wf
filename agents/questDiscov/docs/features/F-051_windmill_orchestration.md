# F-051: Windmill Workflow Orchestration

> **Status**: Draft  
> **Priority**: Medium  
> **Source**: Vision Doc §6.1.2

## Problem

The system has many moving parts (LLM calls, graph updates, Obsidian sync, notifications). We need workflow orchestration without custom code for every integration.

## Solution

Use **Windmill** as a workflow automation layer to orchestrate components.

### Why Windmill

- **TypeScript/Python native**: Scripts as first-class citizens, not low-code limitations
- **Self-hosted**: Data stays local, deploys to Nomad
- **DAG workflows**: Natural fit for dependency-based execution
- **Approval flows**: Human-in-the-loop built-in
- **Versioned scripts**: Git-like versioning for flows
- **OpenAPI integration**: Auto-generate clients from specs

## Technical Design

### Core Workflows

#### 1. Document Ingestion Flow

```typescript
// f/questDiscov/ingest_document.flow.ts
export async function main(path: string) {
  // Step 1: Extract text
  const text = await extractText(path);
  
  // Step 2: Entity extraction (F-002)
  const entities = await fetch('http://questDiscov:3000/api/extract-entities', {
    method: 'POST',
    body: JSON.stringify({ text })
  }).then(r => r.json());
  
  // Step 3: Update graph (F-001)
  await fetch('http://questDiscov:3000/api/graph/update', {
    method: 'POST',
    body: JSON.stringify(entities)
  });
  
  // Step 4: Notify
  await ntfy.publish('Document ingested', { path });
}
```

#### 2. Priority Update Flow

```typescript
// f/questDiscov/update_priorities.flow.ts
// Schedule: */2 * * * * (every 2 hours)

export async function main() {
  // Get priorities (F-023)
  const priorities = await fetch('http://questDiscov:3000/api/priorities').then(r => r.json());
  
  // Format as Markdown
  const markdown = formatPrioritiesMarkdown(priorities);
  
  // Push to Obsidian
  await fetch('http://localhost:27123/vault/Research_Priorities.md', {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${Windmill.getVariable('OBSIDIAN_TOKEN')}` },
    body: markdown
  });
}
```

#### 3. Research Session Flow (with Approval)

```yaml
# f/questDiscov/research_session.flow.yaml
summary: Run research on top priority question
value:
  modules:
    - id: get_priority
      value:
        type: script
        path: f/questDiscov/get_top_priority
        
    - id: approval
      value:
        type: approval
        timeout: 86400  # 24h
        
    - id: run_research
      value:
        type: script
        path: f/questDiscov/run_perplexity_research
        input_transforms:
          question: flow_input.priority.question
          
    - id: update_graph
      value:
        type: script
        path: f/questDiscov/update_graph_with_results
```

#### 4. AI Scientist Iteration

```typescript
// f/questDiscov/ai_scientist_cycle.flow.ts
// Schedule: 0 2 * * * (nightly at 2 AM)

export async function main() {
  // Get knowledge gaps
  const gaps = await graphQuery('MATCH (q:Question) WHERE q.answered = false RETURN q');
  
  // Generate hypotheses (F-030)
  const hypotheses = await generateHypotheses(gaps);
  
  for (const hypothesis of hypotheses) {
    // Design experiment
    const experiment = await designExperiment(hypothesis);
    
    // Execute
    const results = await executeExperiment(experiment);
    
    // Peer review (F-042)
    const review = await peerReview(results);
    
    if (review.decision === 'accept') {
      await updateGraph(hypothesis, results);
    }
  }
  
  // Morning summary
  await generateSummaryReport();
}
```

### Windmill Resources

| Resource | Purpose |
|----------|---------|
| `questDiscov_api` | HTTP connection to questDiscov server |
| `obsidian_api` | Obsidian Local REST API |
| `falkordb` | Graph database connection |
| `ntfy` | Notification service |

### API Endpoints Required

questDiscov server must expose:

```
POST /api/extract-entities     → F-002
POST /api/graph/query          → F-001 (Cypher)
GET  /api/priorities           → F-023
POST /api/hypotheses/generate  → F-030
POST /api/scientist/iterate    → F-042
```

## Module: `windmill-integration.ts`

```typescript
interface WindmillJobResult {
  id: string;
  success: boolean;
  result: any;
  logs: string[];
}

/**
 * Trigger Windmill flow programmatically.
 */
async function triggerFlow(
  flowPath: string,
  args: Record<string, any>
): Promise<WindmillJobResult>;

/**
 * Handle webhook callback from Windmill.
 */
async function handleWindmillCallback(
  payload: WindmillWebhookPayload
): Promise<void>;
```

## Nomad Deployment

```hcl
# questDiscov-windmill.nomad.hcl
job "questDiscov-windmill" {
  datacenters = ["dc1"]
  type = "service"

  group "windmill" {
    network {
      port "http" { static = 8000 }
    }

    task "windmill-server" {
      driver = "docker"
      
      config {
        image = "ghcr.io/windmill-labs/windmill:main"
        ports = ["http"]
      }

      env {
        DATABASE_URL = "postgres://windmill:windmill@postgres:5432/windmill"
      }
    }
  }
}
```

## Use Cases

### Automated Research Pipeline

Set up once, runs automatically:
1. New papers → Ingested → Graph updated → Priorities recalculated → Obsidian updated

### Human-in-the-Loop Approval

Windmill's approval steps pause workflow for human review at critical decisions.

### Multi-Tool Coordination

Coordinate questDiscov server, Obsidian, LLMs, notifications in typed scripts.

## Integration Points

- **All F-xxx features**: Accessed via HTTP API
- **F-050**: Pushes results to Obsidian
- **External**: ntfy for notifications
- **Nomad**: Deployment orchestration

## Verification

1. Deploy Windmill to Nomad
2. Create simple test flow (schedule → API → log)
3. Verify execution and data flow
4. Test approval flow with timeout
5. Benchmark: flow overhead < 500ms

## Effort Estimate

- **Development**: 2-3 days (mostly configuration)
- **Dependencies**: Windmill on Nomad, questDiscov API endpoints
