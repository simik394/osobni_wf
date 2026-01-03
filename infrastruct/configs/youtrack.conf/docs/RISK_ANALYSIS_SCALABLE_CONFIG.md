# Risk Analysis: "Federated" YouTrack Architecture

> **Context**: We proposed a "Standardized Core" strategy to scale to 30+ projects. This document analyzes what could go wrong (implicit hurdles).

---

## 🛑 1. The "Field Pollution" Trap

**Hurdle**: YouTrack has a single global namespace for Custom Fields.
**Risk**: If you name a field `Status` in your `std-agent-v1` template, and later import a project that already has a local `Status` field (but with different values, e.g. "To Verify" vs "Review"), YouTrack will either:
1.  **Merge them** (chaos, mixed value sets).
2.  **Reject the import** (IaC failure).
3.  **Create `Status (1)`** (garbage UI).

**Mitigation**:
*   Namespace your global fields: `PWF_Status`, `PWF_Complexity`.
*   Strict IaC validation: The Prolog engine must fail *before* apply if a field name conflict prevents unification.

## 🛑 2. Workflow "Brittleness" at Scale

**Hurdle**: A global workflow (e.g., "Auto-Prioritize") attached to 30 projects runs on *every* issue update.
**Risk**:
*   **Performance**: One bad loop in JS slows down the entire instance.
*   **Edge Cases**: A rule assuming "Every project has a 'Maturity' field" will crash on the one legacy project you forgot to migrate, potentially blocking issue updates (YouTrack workflows can block transactions).

**Mitigation**:
*   Defensive JS: `if (!issue.fields.Maturity) return;`
*   Canary Deployments: Attach workflow to `DEMO` first, verify, then apply to `template`.

## 🛑 3. Loss of Semantic Granularity

**Hurdle**: "One Board to Rule Them All" forces generic columns.
**Risk**:
*   The `RSRCH` team needs a "Training Model" column.
*   The `INFRA` team needs a "Provisioning" column.
*   The Global Board only supports "In Progress".
*   **Result**: Users create "Shadow Boards" or "Shadow States" (e.g. using tags for state) to track their real work, making the Global Board inaccurate.

**Mitigation**:
*   Allow "Private" columns? No, breaks standard.
*   **Map sub-states**: Use a secondary field `Stage` (Training, Provisioning) visible on project-specific boards, but map them all to `In Progress` for the Global Board (if YouTrack aggregation supports it—often it doesn't easily).

## 🛑 4. The "Integration ID" Nightmare

**Hurdle**: YouTrack uses internal IDs (e.g., `81-5`) for entities.
**Risk**:
*   Your external scripts (Binder/Planner) rely on `Complexity` being field `123-45`.
*   If you delete and recreate the `Complexity` field via IaC (drift fix), it gets a new ID `123-99`.
*   All external integrations break silently until reconfigured.

**Mitigation**:
*   **Never delete global fields**. Set `state: absent` with extreme caution.
*   Use field **names** in API calls where possible (YouTrack supports this, but it's slightly slower).

## 🛑 5. Permission/Visibility Lock-in

**Hurdle**: Global fields often share global visibility settings.
**Risk**:
*   You make `Effort` visible to "All Users".
*   Later, you add a sensitive project (e.g. `FINANCE`).
*   You can't hide `Effort` just for `FINANCE` because the field definition is global.
*   **Result**: You have to fork the field (`Finance_Effort`), breaking the Global Board.

**Mitigation**:
*   Group design: Create `PWF_Core_Team` group. Grant visibility only to them initially.

---

## Summary of Severity

| Risk | Severity | Solution Difficulty |
|------|----------|---------------------|
| Field Pollution | High | Medium (Naming conventions) |
| Workflow Brittleness | Critical | High (Defensive coding) |
| Semantic Loss | Medium | Low (Acceptable trade-off) |
| Integration IDs | High | Medium (Use names) |
| Permission Lock-in | Medium | High (Arch design) |
