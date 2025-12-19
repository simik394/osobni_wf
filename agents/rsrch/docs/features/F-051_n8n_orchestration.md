# F-051: n8n Workflow Orchestration

> **Status**: Draft  
> **Priority**: Medium  
> **Source**: Vision Doc §6.1.2

## Problem

The system has many moving parts (LLM calls, graph updates, Obsidian sync, notifications). We need workflow orchestration without custom code for every integration.

## Solution

Use **n8n** as a low-code workflow automation layer to glue components together.

### Why n8n

- Visual workflow editor
- LangChain integration built-in
- Supports webhooks, scheduling, HTTP
- Self-hosted (data stays local)
- Extensive connector library

## Technical Design

### Core Workflows

#### 1. Document Ingestion Workflow

```
Trigger: File watch (new PDF/MD in inbox folder)
    ↓
Extract text (PDF parser / read file)
    ↓
Call F-002: Entity extraction (HTTP to rsrch server)
    ↓
Update graph (F-001 via HTTP)
    ↓
Notify user (ntfy/Telegram/email)
```

#### 2. Priority Update Workflow

```
Trigger: Schedule (every 2 hours)
    ↓
Call F-023: Get priorities (HTTP to rsrch server)
    ↓
Format as Markdown
    ↓
Push to Obsidian (Local REST API)
    ↓
Log to research log
```

#### 3. Research Session Workflow

```
Trigger: Webhook (user clicks "Start Research")
    ↓
Get top priority question (F-023)
    ↓
Search web for context (web search node)
    ↓
Start Perplexity deep research (rsrch CLI)
    ↓
Wait for completion
    ↓
Extract results, update graph
    ↓
Generate next steps (F-030 LLM)
    ↓
Push to Obsidian
```

#### 4. AI Scientist Iteration (Advanced)

```
Trigger: Schedule (nightly)
    ↓
Get knowledge gaps (graph query)
    ↓
Generate hypotheses (F-030)
    ↓
For each hypothesis:
    ├── Design experiment (LLM)
    ├── Execute (Python/code node)
    ├── Peer review (F-042)
    └── If accepted: Update graph
    ↓
Morning summary report
```

### n8n Nodes Used

| Node | Purpose |
|------|---------|
| **HTTP Request** | Call rsrch server API |
| **LangChain** | LLM integration |
| **Code** | Custom JavaScript/Python |
| **Webhook** | External triggers |
| **Schedule** | Cron jobs |
| **IF** | Conditional branching |
| **Loop** | Iterate over items |
| **Telegram/ntfy** | Notifications |

### API Endpoints Required

rsrch server must expose:

```
POST /api/extract-entities     → F-002
POST /api/graph/query          → F-001 (Cypher)
GET  /api/priorities           → F-023
POST /api/hypotheses/generate  → F-030
POST /api/scientist/iterate    → F-042
```

## Module: `n8n-integration.ts`

```typescript
interface N8nWebhookPayload {
  executionId: string;
  workflowId: string;
  timestamp: string;
  data: any;
}

/**
 * Handle incoming webhook from n8n.
 */
async function handleN8nWebhook(
  payload: N8nWebhookPayload
): Promise<N8nResponse>;

/**
 * Trigger n8n workflow via webhook.
 */
async function triggerWorkflow(
  workflowId: string,
  data: any
): Promise<ExecutionId>;
```

### Sample Workflow JSON (Importable)

```json
{
  "name": "Daily Priority Update",
  "nodes": [
    {
      "type": "n8n-nodes-base.schedule",
      "parameters": {"rule": {"interval": [{"field": "hours", "hoursInterval": 2}]}}
    },
    {
      "type": "n8n-nodes-base.httpRequest",
      "parameters": {
        "url": "http://localhost:3000/api/priorities",
        "method": "GET"
      }
    },
    {
      "type": "n8n-nodes-base.httpRequest",
      "parameters": {
        "url": "http://localhost:27123/vault/Research_Priorities.md",
        "method": "PUT",
        "headers": {"Authorization": "Bearer {{$env.OBSIDIAN_TOKEN}}"},
        "body": "={{$json.markdown}}"
      }
    }
  ]
}
```

## Use Cases

### Automated Research Pipeline

Set up once, runs automatically:
1. New papers → Ingested → Graph updated → Priorities recalculated → Obsidian updated

### Human-in-the-Loop Approval

Workflow pauses for human approval at critical decision points.

### Multi-Tool Coordination

Coordinate rsrch server, Obsidian, LLMs, notifications in one place.

## Integration Points

- **All F-xxx features**: Accessed via HTTP API
- **F-050**: Pushes results to Obsidian
- **External**: ntfy, email, Telegram for notifications

## Verification

1. Create simple test workflow (schedule → API → log)
2. Verify execution and data flow
3. Test failure handling (API down)
4. Benchmark: workflow overhead < 500ms

## Effort Estimate

- **Development**: 2-3 days (mostly configuration)
- **Dependencies**: n8n installation, rsrch API endpoints
