# YouTrack API Coverage Comparison

> Comparison between what YouTrack's REST API supports vs what this codebase currently implements.

## Summary

| Category | API Available | Implemented | Coverage |
|----------|---------------|-------------|----------|
| **Custom Fields** | ✅ Full CRUD | ✅ Sensing + Create + Attach | ~75% |
| **Bundles (enum)** | ✅ Full CRUD | ✅ Sensing + Create + Add Values | ~75% |
| **Projects** | ✅ Full CRUD | ✅ Sensing + Create | ~50% |
| **Workflows** | ✅ Management + JS | ❌ Not implemented | 0% |
| **Issues** | ✅ Full CRUD + Search | ❌ Not implemented | 0% |
| **Time Tracking** | ✅ Settings + Work Items | ❌ Not implemented | 0% |
| **Users/Groups** | ✅ (via Hub API) | ❌ Not implemented | 0% |
| **Agile Boards** | ✅ Boards + Sprints | ❌ Not implemented | 0% |
| **Tags** | ✅ Full CRUD | ❌ Not implemented | 0% |
| **Saved Searches** | ✅ Full CRUD | ❌ Not implemented | 0% |
| **Notifications** | ✅ Settings | ❌ Not implemented | 0% |

---

## Detailed Breakdown

### ✅ Currently Implemented

#### Custom Fields (Sensing + Mutation)

**API Endpoint:** `/api/admin/customFieldSettings/customFields`

| Capability | API | Code |
|------------|-----|------|
| List all custom fields | ✅ | ✅ `get_custom_fields()` |
| Read field attributes | ✅ | ✅ `id, name, fieldType, bundle` |
| Create custom field | ✅ | ✅ `YouTrackActuator.create_field()` |
| Update custom field | ✅ | ❌ Not implemented |
| Delete custom field | ✅ | ❌ Not implemented |
| Attach to project | ✅ | ✅ `YouTrackActuator.attach_field_to_project()` |

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
| Update bundle values | ✅ | ❌ Not implemented |
| Delete bundle/values | ✅ | ❌ Not implemented |

**File:** [`src/controller/main.py`](file:///home/sim/Obsi/Prods/01-pwf/infrastruct/configs/youtrack.conf/src/controller/main.py#L36-L43)

---

#### Prolog Logic Engine

The Prolog inference engine ([`src/logic/core.pl`](file:///home/sim/Obsi/Prods/01-pwf/infrastruct/configs/youtrack.conf/src/logic/core.pl)) implements:

| Feature | Status |
|---------|--------|
| Diff detection (missing fields) | ✅ |
| Diff detection (drifted fields) | ✅ |
| Action generation (`create_field`, `update_field_type`) | ✅ |
| Dependency graph (bundle → field) | ✅ |
| Topological sort (action ordering) | ✅ |

---

### ❌ Not Implemented

#### Projects

**API Endpoints:**
- `/api/admin/projects` - List/create projects
- `/api/admin/projects/{id}` - Get/update/delete project
- `/api/admin/projects/{id}/customFields` - Project-specific fields
- `/api/admin/projects/{id}/timeTrackingSettings` - Time tracking config

| Capability | Priority | Use Case |
|------------|----------|----------|
| Create project | 🔴 High | Provision new projects from config |
| Configure project fields | 🔴 High | Auto-attach fields to projects |
| Set project leader | 🟡 Medium | Org structure |
| Archive/restore project | 🟢 Low | Project lifecycle |

---

#### Workflows

**API Endpoints:**
- `/api/admin/workflows` - List/upload workflows
- `/api/admin/projects/{id}/workflows` - Project workflow attachments

| Capability | Priority | Use Case |
|------------|----------|----------|
| List workflows | 🟡 Medium | Audit installed workflows |
| Attach workflow to project | 🔴 High | Enforce consistent automation |
| Upload custom workflow | 🟢 Low | Version-controlled workflows |

---

#### Other Bundle Types

Besides `enum`, YouTrack supports additional bundle types:

| Bundle Type | API Endpoint | Use Case |
|-------------|--------------|----------|
| State bundles | `/bundles/state` | Workflow states (Open, In Progress, Done) |
| Version bundles | `/bundles/version` | Software versions for Affected/Fix Version |
| Build bundles | `/bundles/build` | Build numbers |
| User bundles | `/bundles/user` | Assignee constraints |
| Owned bundles | `/bundles/ownedField` | Custom owned fields |

---

#### Issues

**API Endpoints:**
- `/api/issues` - List/search/create issues
- `/api/issues/{id}` - Get/update/delete issue
- `/api/issues/{id}/comments` - Issue comments
- `/api/issues/{id}/attachments` - Attachments

> [!NOTE]
> Issue management is typically outside the scope of IaC (configuration as code), but could be useful for seeding template issues or migration.

---

#### Agile Boards

**API Endpoints:**
- `/api/agiles` - List/create agile boards
- `/api/agiles/{id}` - Get/update board
- `/api/agiles/{id}/sprints` - Sprint management

| Capability | Priority | Use Case |
|------------|----------|----------|
| Create board | 🟡 Medium | Standup team boards from config |
| Configure swimlanes | 🟡 Medium | Consistent board layouts |
| Sprint templates | 🟢 Low | Pre-configured sprints |

---

#### Time Tracking

**API Endpoints:**
- `/api/admin/projects/{id}/timeTrackingSettings`
- `/api/issues/{id}/timeTracking/workItems`

| Capability | Priority | Use Case |
|------------|----------|----------|
| Enable time tracking | 🟡 Medium | Project setup |
| Configure estimates | 🟡 Medium | Consistent estimation settings |

---

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
- Creating custom fields
- Creating bundles (enum and state)
- Adding values to bundles
- Creating projects
- Attaching fields to projects

```python
# Actuator interface
class YouTrackActuator:
    def create_field(self, name: str, type: str, bundle_name_or_id: Optional[str] = None) -> ActionResult: ...
    def create_bundle(self, name: str, bundle_type: str = 'enum') -> ActionResult: ...
    def add_bundle_value(self, bundle_name_or_id: str, value_name: str, bundle_type: str = 'enum') -> ActionResult: ...
    def create_project(self, name: str, short_name: str, leader_id: Optional[str] = None) -> ActionResult: ...
    def attach_field_to_project(self, field_name_or_id: str, project_id: str, can_be_empty: bool = True) -> ActionResult: ...
```

---

## Roadmap Suggestion

### Phase 1: Complete Field/Bundle Loop ✅
1. ✅ Sensing (read fields/bundles) — Done
2. ✅ Actuator: Create field — Done
3. ✅ Actuator: Create bundle (enum + state) — Done
4. ✅ Actuator: Add bundle values — Done
5. ✅ Actuator: Attach field to project — Done
6. ✅ Janus integration (Python ↔ Prolog) — Done

### Phase 2: Project Configuration (In Progress)
1. ✅ Sensing: Read projects — Done
2. ✅ Actuator: Create project — Done
3. ⬜ Full project field attachment validation
4. ⬜ Logic: Project-level dependencies

### Phase 3: Workflows
1. ⬜ Sensing: List workflows
2. ⬜ Actuator: Attach workflow to project
3. ⬜ Logic: Workflow constraints

---

## API Reference

- [YouTrack REST API Reference](https://www.jetbrains.com/help/youtrack/devportal/youtrack-rest-api.html)
- [YouTrack Postman Collection](https://www.postman.com/jetbrains-youtrack/workspace/youtrack)
- [Hub REST API (Users/Groups)](https://www.jetbrains.com/help/hub/rest-api.html)
