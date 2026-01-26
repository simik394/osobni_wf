# Branch Cleanup & Analysis Report

**Date**: 2026-01-25
**Status**: Completed

## Summary
A comprehensive analysis of 10+ feature branches was conducted. Significant useful code was identified in `TOOLS-63` (GraphStore extensions) and `feat-angrav` (Windmill scripts), which has been assimilated into `main`.

## Findings

### 1. The "Mega-Branch" Pattern
Several branches were identified as "snapshots" with disjoint history.
*   `origin/TOOLS-50-centralize-config...`: Redundant. `main` has superior config logic.
*   `origin/feat-TOOLS-69-windmill-flow...`: Redundant. `main` has better templates.
*   `origin/feat-TOOLS-87-add-openapi...`: Stale/Broken imports.
*   `origin/feat-infra-dashboard...`: Redundant.
*   `origin/feat-jules-go-browser-automation...`: Superseded by `jules-go` in `main`.

### 2. Assimilated Features
The following logic was **extracted and merged** into `assimilated-pr-20` (HEAD):

*   **From `origin/TOOLS-63-add-gemini-session-tracking...`**:
    *   **Full GraphStore Implementation**: `agents/rsrch/src/graph-store.ts` was upgraded from a partial stub to a full implementation including:
        *   Pending Audio management (Windmill integration).
        *   Entity/Relationship mapping (Knowledge Graph).
        *   Fact extraction and Reasoning steps.
        *   Citation tracking with `apoc` fallback.
    *   This bridges the gap between the `rsrch` agent and the knowledge graph.

*   **From `origin/feat-angrav-persistent-history...`**:
    *   **Angrav Windmill Scripts**: Recovered 4 missing scripts (`chat_completion.ts`, `dismiss_popups.ts`, etc.) from a misplaced directory (`infrastruct/configs/...`) and moved them to `agents/rsrch/windmill/f/agents/angrav/`.

### 3. Recommendation
With the critical logic extracted, the following branches are now **safe to delete**:

```text
origin/TOOLS-50-centralize-config-2122412381242290227
origin/TOOLS-63-add-gemini-session-tracking-6384360672231470378
origin/TOOLS-65-orphan-cleanup-job-5282652563543133346
origin/TOOLS-67-falkordb-sync-fix-8586789440406093500
origin/feat-TOOLS-69-windmill-flow-templates-6315938199643021303
origin/feat-TOOLS-87-add-openapi-spec-2702938229025728362
origin/feat-add-gemini-client-tests-8466822155028745541
origin/feat-add-session-management-cli-5094259927117750304
origin/feat-add-windmill-nomad-job-1122205542904391822
origin/feat-angrav-persistent-history-14196839462649387149
origin/feat-graceful-shutdown-15750702362189906998
origin/feat-infra-dashboard-5158685305511540484
origin/feat-jules-go-browser-automation-4163621839892381246
origin/feat-jules-go-cli-subcommands-15810764562972397101
origin/feat-jules-go-client-13211678170604826930
origin/feat-jules-go-lint-install-12878456446824015449
origin/feat-jules-go-makefile-7707732377747792147
origin/feat-jules-go-prometheus-metrics-13456023134569934320
origin/feat-proj-context-score-8817692433023932291
origin/feature-TOOLS-103-webhook-handlers-1444935232585792228
origin/feature-TOOLS-64-perplexity-falkordb-13711526789922644075
origin/feature-TOOLS-68-watch-audio-completion-5371967039735074141
origin/feature-bundle-quest5-tools122-tools132-14430169512414124969
origin/feature-tools-58-content-injection-14421962158747993235
origin/fix-TOOLS-101-queue-test-segfault-5808237674888542748
origin/fix-rsrch-compilation-11436059471647233324
```
