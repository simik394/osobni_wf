# YouTrack Workflow API (Reverse Engineered)

> **Source**: Captured network traffic from YouTrack 2025.3 UI
> **Date**: 2026-01-01

## Authentication

All endpoints require authentication. Use either:
- Session cookie (from browser login)
- Bearer token: `Authorization: Bearer <permanent_token>`

## Base URL

```
http://youtrack.100.73.45.27.nip.io/api/admin
```

---

## Workflow Endpoints

### 1. Create Workflow (App)

Creates a new empty workflow container.

```http
POST /api/admin/apps?fields=id
Content-Type: application/json

{
  "title": "My Workflow",
  "name": "my-workflow",
  "model": null
}
```

**Response:**
```json
{
  "id": "144-67",
  "$type": "App"
}
```

---

### 2. Create Rule in Workflow

Adds a rule (on-change, on-schedule, action, etc.) to an existing workflow.

```http
POST /api/admin/workflows/{workflow_id}/rules?$top=-1&fields=description,id,name,script,title,type,...
Content-Type: application/json

{
  "type": "StatelessRule",
  "name": "my-rule",
  "script": "const entities = require('@jetbrains/youtrack-scripting-api/entities');\n\nexports.rule = entities.Issue.onChange({\n  title: 'My Rule',\n  guard: (ctx) => true,\n  action: (ctx) => {\n    const issue = ctx.issue;\n    // your logic here\n  },\n  requirements: {}\n});"
}
```

**Response:**
```json
{
  "type": "StatelessRule",
  "workflow": {
    "language": {"id": "JS"},
    "name": "my-workflow",
    "id": "144-67"
  },
  "title": "My Rule",
  "name": "my-rule",
  "script": "...",
  "id": "146-239",
  "$type": "WorkflowRule"
}
```

---

### 3. List All Workflows

```http
GET /api/admin/workflows?$top=-1&fields=id,name,title,rules(name,script)&query=language:JS,visual,mps
```

---

### 4. Get Workflow Details

```http
GET /api/admin/workflows/{workflow_id}?$top=-1&fields=autoAttach,compatible,name,title,rules(id,name,script,type)
```

---

### 5. List All Apps (Workflows + SLAs)

```http
GET /api/admin/apps?fields=id,title,name,updated&tags=workflow,sla&sort=asc&$skip=0&$top=51
```

---

### 6. Update Rule Script

Updates an existing rule's script by ID.

```http
POST /api/admin/workflows/{workflow_id}/rules/{rule_id}?$top=-1&fields=...
Content-Type: application/json

{
  "id": "146-257",
  "script": "// updated JavaScript code here"
}
```

---

### 7. Delete Rule

```http
DELETE /api/admin/workflows/{workflow_id}/rules/{rule_id}
```

---

### 8. Delete Workflow

```http
DELETE /api/admin/workflows/{workflow_id}
```

---

### 9. Update Workflow Manifest

Updates workflow metadata (name, title, version, vendor).

```http
POST /api/admin/workflows/{workflow_id}?$top=-1&fields=...
Content-Type: application/json

{
  "id": "144-67",
  "manifestFile": {
    "content": "{\n  \"name\" : \"my-workflow\",\n  \"title\" : \"My Workflow\",\n  \"version\" : \"0.0.2\",\n  \"visual\" : true,\n  \"vendor\" : {\n    \"name\" : \"Your Name\"\n  }\n}"
  }
}
```

---

## Rule Types (Complete List)

| Type | API Type | Description |
|------|----------|-------------|
| On-change | `StatelessRule` | Triggers when issue is modified |
| On-schedule | `ScheduledRule` | Runs on a schedule |
| State-machine | `StateMachine` | Manages field transitions |
| Action | `StatelessActionRule` | Custom command |
| Custom | `CustomRule` | Reusable functions/modules |

---

## Example: Full Workflow Creation

### Step 1: Create Workflow Container
```bash
curl -X POST "http://youtrack.100.73.45.27.nip.io/api/admin/apps?fields=id" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Auto-Assign","name":"auto-assign","model":null}'
```

### Step 2: Add Rule to Workflow
```bash
curl -X POST "http://youtrack.100.73.45.27.nip.io/api/admin/workflows/WORKFLOW_ID/rules" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "StatelessRule",
    "name": "assign-on-create",
    "script": "exports.rule = require(\"@jetbrains/youtrack-scripting-api/entities\").Issue.onChange({title:\"Auto Assign\",action:(ctx)=>{if(!ctx.issue.assignee){ctx.issue.assignee=ctx.currentUser;}}});"
  }'
```

---

## Notes

- Workflow ID format: `144-XX` (where XX is a number)
- Rule ID format: `146-XXX`
- The `$type` field indicates the entity type (App, Workflow, WorkflowRule)
- Scripts use the `@jetbrains/youtrack-scripting-api` package
