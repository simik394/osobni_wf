# YouTrack API Coverage Comparison

> Comparison between what YouTrack's REST API supports vs what this codebase currently implements.

## Summary

| Category | API Available | Implemented | Coverage |
|----------|---------------|-------------|----------|
| **Custom Fields** | ✅ Full CRUD | ✅ Full CRUD | ~95% |
| **Bundles (enum)** | ✅ Full CRUD | ✅ Full CRUD | ~95% |
| **Projects** | ✅ Full CRUD | ✅ Full CRUD | ~90% |
| **Workflows** | ✅ Management + JS | ✅ Attached + Rules | ~80% |
| **Agile Boards** | ✅ Boards + Sprints | ✅ Board Configuration | ~85% |
| **Tags** | ✅ Full CRUD | ✅ Full CRUD | 100% |
| **Saved Searches** | ✅ Full CRUD | ✅ Full CRUD | 100% |
| **Issues** | ✅ Full CRUD + Search | ❌ Not implemented | 0% |
| **Time Tracking** | ✅ Settings + Work Items | ❌ Not implemented | 0% |
| **Users/Groups** | ✅ (via Hub API) | ❌ Not implemented | 0% |
| **Notifications** | ✅ Settings | ❌ Not implemented | 0% |

---

## Detailed Breakdown

### ✅ Currently Implemented

#### Agile Boards (Full Configuration)

**API Endpoint:** `/api/agiles`

| Capability | API | Code |
|------------|-----|------|
| Create/Update Board | ✅ | ✅ `create/update_agile_board` |
| Configure Columns | ✅ | ✅ WIP Limits, Status Mapping |
| Configure Swimlanes | ✅ | ✅ Attribute-based settings |
| Color Coding | ✅ | ✅ Field/Project based |
| Estimation Settings | ✅ | ✅ Burndown configuration |
| Backlog Query | ✅ | ✅ Saved Search linkage |
| Sprints | ✅ | ⚠️ Config only (Manual creation) |

#### Workflows

**API Endpoint:** `/api/admin/workflows`

| Capability | API | Code |
|------------|-----|------|
| List workflows | ✅ | ✅ `get_workflows` |
| Attach to project | ✅ | ✅ `attach_workflow_to_project` |
| Upload rules (JS) | ✅ | ✅ File-based or Inline scripts |

#### Global Features (Tags & Saved Queries)

| Capability | API | Code |
|------------|-----|------|
| Create/Update Tags | ✅ | ✅ `create/update_tag` |
| Untag on Resolve | ✅ | ✅ Supported |
| Saved Queries | ✅ | ✅ Full CRUD |

#### Custom Fields (Sensing + Mutation)

**API Endpoint:** `/api/admin/customFieldSettings/customFields`

| Capability | API | Code |
|------------|-----|------|
| List all custom fields | ✅ | ✅ `get_custom_fields()` |
| Read field attributes | ✅ | ✅ `id, name, fieldType, bundle` |
| Create custom field | ✅ | ✅ `YouTrackActuator.create_field()` |
| Update custom field | ✅ | ✅ `YouTrackActuator.update_field()` |
| Delete custom field | ✅ | ✅ `YouTrackActuator.delete_field()` |
| Attach to project | ✅ | ✅ `YouTrackActuator.attach_field_to_project()` |
| Detach from project | ✅ | ✅ `YouTrackActuator.detach_field_from_project()` |

**File:** [`src/controller/main.py`](file:///home/sim/Obsi/Prods/01-pwf/infrastruct/configs/youtrack.conf/src/controller/main.py#L27-L34)

---

#### Enum Bundles (Sensing + Mutation)

**API Endpoint:** `/api/admin/customFieldSettings/bundles/enum`

| Capability | API | Code |
|------------|-----|------|
| List all enum bundles | ✅ | ✅ `get_bundles()` |
| Read bundle values | ✅ | ✅ `id, name, values` |
| Create bundle | ✅ | ✅ `YouTrackActuator.create_bundle()` |
| Add bundle values | ✅ | ✅ `YouTrackActuator.add_bundle_value()` |
| Update bundle values | ✅ | ✅ `YouTrackActuator.update_bundle_value()` |
| Archive bundle values | ✅ | ✅ `YouTrackActuator.archive_bundle_value()` |
| Delete bundle | ✅ | ✅ `YouTrackActuator.delete_bundle()` |

**File:** [`src/controller/main.py`](file:///home/sim/Obsi/Prods/01-pwf/infrastruct/configs/youtrack.conf/src/controller/main.py#L36-L43)

---

#### Prolog Logic Engine

The Prolog inference engine ([`src/logic/core.pl`](file:///home/sim/Obsi/Prods/01-pwf/infrastruct/configs/youtrack.conf/src/logic/core.pl)) implements:

| Feature | Status |
|---------|--------|
| Diff detection (missing fields) | ✅ |
| Diff detection (drifted fields) | ✅ |
| Action generation (`create_field`, `update_field_type`) | ✅ |
| Dependency graph (bundle → field → project → board) | ✅ |
| Topological sort (action ordering) | ✅ |

---

### ❌ Not Implemented

#### Issues & Time Tracking

**API Endpoints:**
- `/api/issues`
- `/api/admin/projects/{id}/timeTrackingSettings`

> [!NOTE]
> Issue management is typically outside the scope of IaC (configuration as code), but could be useful for seeding template issues or migration.

#### Users & Groups (Hub API)

User management is handled by **JetBrains Hub**, not YouTrack directly.

**Hub API Endpoints:**
- `/api/rest/users` - User management
- `/api/rest/usergroups` - Group management
- `/api/rest/roles` - Role definitions
- `/api/rest/permissions` - Permission assignments

---

## Actuator - Implemented Component

The `src/actuator/` directory contains the implementation for applying changes to YouTrack.

It currently supports:
- **Core**: Projects, Custom Fields, Bundles
- **Agile**: Boards, Columns, Swimlanes, Color Coding, WIP Limits
- **Process**: Workflows, Rules, Scripts
- **Global**: Tags, Saved Queries

```python
# Actuator interface (Selected methods)
class YouTrackActuator:
    def create_field(self, name: str, type: str, bundle_name_or_id: Optional[str] = None) -> ActionResult: ...
    def create_bundle(self, name: str, bundle_type: str = 'enum') -> ActionResult: ...
    def create_project(self, name: str, short_name: str, leader_id: Optional[str] = None) -> ActionResult: ...
    def create_agile_board(self, name: str, projects: list[str], column_settings: dict, ...) -> ActionResult: ...
    def update_agile_board(self, board_id: str, ...) -> ActionResult: ...
    def create_tag(self, name: str, ...) -> ActionResult: ...
    def create_saved_query(self, name: str, query: str, ...) -> ActionResult: ...
```

---

## API Reference

- [YouTrack REST API Reference](https://www.jetbrains.com/help/youtrack/devportal/youtrack-rest-api.html)
- [YouTrack Postman Collection](https://www.postman.com/jetbrains-youtrack/workspace/youtrack)
- [Hub REST API (Users/Groups)](https://www.jetbrains.com/help/hub/rest-api.html)
