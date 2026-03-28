# YouTrack IaC: Testing Methodology & API Coverage

## 1. Testing Methodology

The YouTrack IaC project uses a comprehensive, multi-layered testing strategy that separates concerns between logic, configuration, and execution. The test suite is invoked via `pytest tests/` and runs extremely fast due to extensive mocking.

### A. Actuator Tests (`test_actuator.py`)
- **Focus**: Validates that Prolog action plans are translated into the correct REST API calls.
- **Approach**: Uses Python's `unittest.mock` (specifically `@patch('requests.Session')`) to completely eliminate real HTTP calls. 
- **Key Validations**:
  - Validates that `session.post`, `session.get`, and `session.delete` are called with the correct endpoints (e.g., `/api/admin/users`) and JSON payloads.
  - Tests **Dry Run** mode to ensure zero mutating calls are made when enabled.
  - Tests **Idempotency logic**, proving that if an entity creation returns a `409 Conflict` (meaning it already exists) or is found via a preemptive GET, the actuator treats it as a success without crashing.

### B. Logic and Inference Tests (`test_inference.py`, `test_logic.pl`)
- **Focus**: Validates the core "diff algorithm" written in SWI-Prolog.
- **Approach (`test_inference.py`)**: Tests the `janus_swi` bridge. It asserts various dummy "Current State" and "Target State" facts into the Prolog engine, triggers `compute_plan()`, and verifies that the output list of actions is correct (e.g., creating missing fields, deleting orphaned users). It heavily relies on `clear_facts()` cleanly wiping the dynamic databases between tests to avoid state bleeding.
- **Approach (`test_logic.pl`)**: Uses Prolog's native `PLUnit` test framework for pure logic rule validation without python overhead.

### C. Configuration & Translation Tests (`test_config.py`)
- **Focus**: Validates the Pydantic data schemas and YAML parsing.
- **Key Validations**:
  - Ensures project, UI, and UAM rules defined in YAML are loaded correctly with defaults.
  - Validates the `translator.py` module, which converts Python Pydantic objects into raw Prolog string assertions (e.g., transforming a `UserConfig` into `target_user('login', 'Full Name', 'email@test.com').`).

---

## 2. Unused YouTrack API Endpoints

While the current engine covers a massive portion of YouTrack's core functionality (Projects, Boards, Fields, Workflows, Users/Groups/Roles), there are several administrative endpoints still available that could be brought under declarative control:

### A. DevOps & VCS Integrations
- **Endpoint**: `/api/admin/projects/{id}/vcsIntegrations`
- **Potential Use Case**: Automatically linking projects to GitHub, GitLab, or Bitbucket repositories, enabling commit tracking and issue resolution via PRs.

### B. Time Tracking Settings
- **Endpoint**: `/api/admin/timeTrackingSettings` (Global) and `/api/admin/projects/{id}/timeTrackingSettings` (Project-specific)
- **Potential Use Case**: Declaratively enabling time tracking, defining work item types (e.g., "Development", "Testing"), and setting default workweek schedules.

### C. Issue Link Types
- **Endpoint**: `/api/issueLinkTypes`
- **Potential Use Case**: Managing custom relationships between tickets beyond the defaults. For instance, declarative creation of custom directed links like `Blocks Release` / `Is Blocked By Release`.

### D. Authentication Modules (Hub)
- **Endpoint**: `/api/hub/authmodules` (via JetBrains Hub API which YouTrack uses under the hood)
- **Potential Use Case**: Automating the configuration of SAML 2.0, OAuth2, or Active Directory/LDAP integration for SSO.

### E. Reporting & Dashboards
- **Endpoint**: `/api/reports` and `/api/dashboards`
- **Potential Use Case**: Provisioning standardized dashboards (e.g., "Sprint Overview", "Developer Personal Board") or automated generated reports (Burndown, Cumulative flow) for all teams automatically when a new project is created via the YAML file.

### F. SLA Policies (Helpdesk)
- **Endpoint**: `/api/admin/projects/{id}/slaPolicies`
- **Potential Use Case**: In Helpdesk projects, declaratively defining SLA rules (e.g., "Reply to Critical tickets within 1 hour").
