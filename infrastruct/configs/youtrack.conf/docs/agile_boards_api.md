# YouTrack Agile Boards API

> **Source**: Reverse-engineered from YouTrack 2025.3 REST API
> **Date**: 2026-01-02

## Overview

Agile Boards in YouTrack provide Kanban/Scrum views for issue tracking. This document covers the API for creating and managing boards programmatically.

## Authentication

See [workflow_api.md](workflow_api.md) for authentication details.

---

## Important Notes

### 1. Global vs Project Field IDs

**Critical**: When creating boards, `columnSettings.field.id` MUST reference the **Global Custom Field ID**, NOT the project-specific field ID.

- **Global Field ID**: Obtained from `/api/admin/customFieldSettings/customFields`
  - Example: `150-2` for "State"
- **Project Field ID**: Obtained from `/api/admin/projects/{id}/customFields`
  - Example: `177-2` for "State" in project "DEMO"

Using the wrong ID results in `400 Bad Request: Invalid entity type`.

### 2. $type Annotations

Include `$type` annotations for polymorphic types:
- Root: `"$type": "Agile"`
- `ColumnSettings`: `"$type": "ColumnSettings"`
- Projects: `"$type": "Project"` (optional but safe)
- Field: `"$type": "CustomField"` (optional but safe)

---

## Endpoints

### 1. List All Agile Boards

```http
GET /api/agiles?fields=id,name,projects(id,name),columnSettings(field(id,name),columns(presentation)),sprints(id,name)
```

**Response:**
```json
[
  {
    "name": "Demo Board",
    "id": "192-0",
    "projects": [{"id": "0-0", "name": "Demo project"}],
    "columnSettings": {
      "field": {"id": "150-2", "name": "State"},
      "columns": [{"presentation": "To do"}, {"presentation": "Done"}]
    },
    "$type": "Agile"
  }
]
```

---

### 2. Create Agile Board

```http
POST /api/agiles?fields=id,name
Content-Type: application/json

{
  "name": "New Board",
  "projects": [{"id": "0-0", "$type": "Project"}],
  "columnSettings": {
    "$type": "ColumnSettings",
    "field": {"id": "150-2", "$type": "CustomField"}
  },
  "$type": "Agile"
}
```

**Response:**
```json
{
  "id": "192-11",
  "name": "New Board",
  "$type": "Agile"
}
```

---

### 3. Get Board Details

```http
GET /api/agiles/{board_id}?fields=id,name,projects(id,name),columnSettings(field(id,name),columns(presentation,value(name))),swimlaneSettings(field(id,name))
```

---

### 4. Delete Board

```http
DELETE /api/agiles/{board_id}
```

---

## Field Defaults API

To set a default value for a custom field in a specific project:

```http
POST /api/admin/projects/{project_id}/customFields/{field_id}
Content-Type: application/json

{
  "defaultBundleElement": {"id": "153-17"}
}
```

Where:
- `{project_id}`: Project ID (e.g., `0-0`)
- `{field_id}`: Project Custom Field ID (e.g., `177-0` for Priority)
- `id`: Bundle Element ID of the default value (get from bundle values endpoint)

---

## YAML Configuration

### Agile Board

```yaml
boards:
  - name: "Sprint Board"
    column_field: "State"  # Uses this field for columns
    projects: []           # Optional: additional projects to include
```

### Field Default

```yaml
fields:
  - name: Priority
    type: enum
    bundle: PriorityBundle
    default_value: Normal  # Sets default to "Normal"
```
