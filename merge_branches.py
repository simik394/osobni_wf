import time
import subprocess
import json

# Repos
REPO_NAME = "simik394/osobni_wf"

# Branches (Cleaned list from previous output)
BRANCHES = [
    "TOOLS-63-add-gemini-session-tracking",
    "feat-TOOLS-83-add-graph-command-tests",
    "feat-TOOLS-87-add-openapi-spec",
    "feat-add-gemini-client-tests",
    "feat-add-session-management-cli",
    "feat-angrav-persistent-history",
    "feat-falkordb-client",
    "feat-graceful-shutdown",
    "feat-infra-dashboard",
    "feat-jules-go-cli-subcommands",
    "feat-jules-go-client-tests",
    "feat-jules-go-config-package",
    "feat-jules-go-lint-install",
    "feat-jules-go-makefile",
    "feat-jules-go-prometheus-metrics",
    "feat-ntfy-client",
    "feat-proj-context-score",
    "feature-TOOLS-103-webhook-handlers",
    "feature-TOOLS-76-session-manager",
    "feature-bundle-quest5-tools122-tools132",
    "feature-tools-58-content-injection",
    "fix-TOOLS-101-queue-test-segfault",
    "fix-rsrch-compilation",
    "jules-TOOLS-49-replace-any-types",
    "jules-TOOLS-84-github-pr-monitor",
    "jules-cleanup-rsrch-src",
    "jules-go-publish-async",
    "jules-go-refactor-TOOLS-118",
    "jules-infra-setup-nomad-youtrack",
    "jules-log-TOOLS-51",
    "jules-readme-rework",
    "jules/pm-phase-1",
    "mapobsi-export-enhancements",
    "mapobsi-tests-error-handling",
    "proj-agent-langgraph-impl",
    "quest-7-history-integration",
    "quest-8-advanced-solver-hints",
    "refactor-notebooklm-selectors",
    "refactor-rsrch-cli-commander",
    "rsrch-workflow-engine",
    "status-sessions-merge",
    "sync-youtrack-command",
    "tools-132-async-arch",
    "tools-139-session-state-dashboard",
    "tools-142-dashboard",
    "tools-142-pr-status-cli",
    "tools-34-sse-support",
    "tools-43-refactor-rsrch-cli",
    "tools-45-selectors-tests",
    "tools-46-rsrch-shared-lib",
    "tools-47-dynamic-container-id",
    "tools-54-falkordb-sync",
    "tools-56-windmill-integration",
    "tools-57-gemini-gems",
    "tools-79-go-webhook-handler",
    "tools-80-health-check",
    "tools-cleanup-and-features",
    "unified-research-agent-interface",
    "windmill-pending-audio-sync",
    "yousidian-integration-core"
]

# Grouping Logic
BATCHES = {
    "Jules-Go-Core": [b for b in BRANCHES if "jules-go" in b],
    "Rsrch-Agent": [b for b in BRANCHES if "rsrch" in b or "notebooklm" in b or "gemini" in b],
    "Tools-Features": [b for b in BRANCHES if "tools" in b.lower() and "jules-go" not in b],
    "Projects": [b for b in BRANCHES if any(x in b for x in ["quest", "mapobsi", "proj-", "yousidian", "angrav"])],
    "Infra-Misc": [b for b in BRANCHES if any(x in b for x in ["infra", "falkor", "ntfy", "shutdown", "webhook", "readme"])]
}

# Prompt Template
PROMPT_TEMPLATE = """
Merge Task for {group_name}:
The following branches need to be reviewed and merged into main if they are ready:
{branches}

Instructions:
1. Fetch and checkout each branch.
2. Review the changes (diff with main).
3. If the changes look correct and safe:
   - Merge into main.
   - If there are conflicts, resolve them if simple, or skip and report.
4. If the branch seems obsolete or fully contained in main, delete it.
5. Push changes to main.
"""

def submit_task(group, branches):
    if not branches:
        return
    
    prompt = PROMPT_TEMPLATE.format(group_name=group, branches="\n- ".join(branches))
    print(f"🚀 Submitting task for {group} ({len(branches)} branches)...")
    
    # NOTE: In a real script we would call the MCP tool here.
    # Since I am writing this to be executed by me (the agent), I will just print the intent
    # and then I will manually call the tool in the next step.
    # But to simulate "splitting work", I will just output the batches.
    
    print(json.dumps({"group": group, "prompt": prompt}))

if __name__ == "__main__":
    for group, branches in BATCHES.items():
        submit_task(group, branches)
