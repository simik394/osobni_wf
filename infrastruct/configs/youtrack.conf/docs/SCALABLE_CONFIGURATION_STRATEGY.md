# Scalable YouTrack Configuration Strategy (10-30+ Projects)

To support **8 current projects** and scale 3x (24+ projects) without drowning in maintenance, you need a **"Standardized Core, Federated Content"** architecture.

The goal is to enable adding a new project in **minutes** (via your API/IaC tool) that immediately plugs into all global processes, boards, and reports.

---

## 1. Core Architecture: "The Golden Set"

You must strictly prohibit project-local fields for operational metrics. All projects must share:

### A. Global Custom Fields (Mandatory)
These fields exist *once* in the system and are attached to *every* project.

| Field Name | Type | Scaling Value |
|------------|------|---------------|
| **Complexity** | `enum[Low, Medium, High]` | Cross-project capacity planning |
| **Effort** | `period` | Global efficiency tracking |
| **Tech Stack** | `enum[TS, Python, Go...]` | Skill-based resource allocation |
| **Layer** | `enum[Agent, Infra, Integration]` | Architectural heatmap (where are we building?) |
| **Maturity** | `integer (0-5)` | Project health indexing |

### B. Standardized State Machine
All projects share **one** State bundle. Do not create "Agent State" vs "Infra State".

**States**:
1. `Open` (Backlog)
2. `Ready` (Selected for development)
3. `In Progress` (Active)
4. `Review` (PR / Verify)
5. `Done` (Shipped)
6. `Blocked` (Waiting)

---

## 2. Global Agile Boards ("Views, not Buckets")

Avoid "One Board Per Project". Instead, use **Global Boards** driven by saved queries.

### A. The "Executive View" (All Projects)
- **Swimlanes**: By Project
- **Columns**: State (Open → Done)
- **Use Case**: High-level status check. "What is stuck in RSRCH? What is moving in PLAN?"

### B. The "Context View" (Work Mode)
- **Swimlanes**: By `Layer` (Agent vs Infra)
- **Columns**: State
- **Use Case**: "I verified the Infra changes, now deploying the Agent updates."

### C. The "Personal Focused Board"
- **Row**: `Assignee: Me`
- **Columns**: State
- **Use Case**: "What is on *my* plate across all 20 projects?"

---

## 3. Automation Strategy (Pwf-Level Rules)

Use **Global Workflows** attached automatically to all projects.

| Rule Name | Logic | Why it scales |
|-----------|-------|---------------|
| **Auto-Prioritize** | If `Complexity=High` & `Effort>20h` → `Priority=Critical` | Rules don't change when projects are added. |
| **Stale Warning** | If state is `In Progress` > 5 days → Comment "Update status?" | Keeps data clean without manual checking. |
| **Orphan Check** | If `Subtask` has no `Parent` → Tag `#orphaned` | Prevents lost tasks in large hierarchies. |
| **PM Agent Trigger** | On Create → Webhook to `PLAN` Agent | Your AI agent manages the router, not YouTrack rules. |

---

## 4. Scalable IaC (Your `YTIAC` Project)

Your `youtrack.conf` project is the key enabler.

**The "Project Template" Pattern**:
Define a single `StandardProject` class in your Python/Prolog config that:
1. Creates Project
2. Attaches the "Golden Set" of fields
3. Attaches the "Standard Workflow"
4. Adds Project ID to the "Global Board" query

**Adding Project #25**:
```yaml
projects:
  - name: "New AI Module"
    id: "AIMOD"
    template: std-agent-v1  # <--- This line does 90% of the setup
```

---

## 5. Capacity Planning (The "3x" Factor)

To handle 30 projects, you need to stop thinking about "Issues" and start thinking about "Initiatives".

**The `Epic` Layer**:
- Create a meta-project called **`ROADMAP`** (or `PWF`).
- Issues here represent large goals (e.g., "Implement PM Agent").
- Links: `ROADMAP-1` **parent of** `PLAN-42` and `RSRCH-12`.
- **Gantt Chart** acts on `ROADMAP` project only.
- **Result**: You manage 5-10 active Epics, which drive 100+ tasks across 30 projects.

---

## Summary Checklist

- [ ] **Define** the 5-7 Global Fields.
- [ ] **Refine** the One State Machine.
- [ ] **Create** the "All Projects" Agile Board.
- [ ] **Implement** `StandardProject` template in `YTIAC`.
- [ ] **Launch** `ROADMAP` meta-project. 
