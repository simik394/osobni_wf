#!/bin/bash
API_KEY="AQ.Ab8RN6Jsuhl61jeZvjhOcIiZk3TzaeC-JRE58y5pJP32yA4KIw"

# 1. Launch PR #87 Retry 3
echo "Launching PR #87 Retry 3..."
curl -s -X POST -H "x-goog-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "URGENT: Manually resolve conflicts in PR #87 (status-sessions). Repo: simik394/osobni_wf. Branch: tools-139-session-state-dashboard-14217855041591550383. Fetch origin, merge origin/main. RESOLVE CONFLICTS in `cmd/jules-cli/main.go` (ensure `watch`, `publish-all`, and `status-sessions` commands coexist) and `client.go`. RUN `go build ./cmd/jules-cli` to verify. COMMIT and PUSH FORCE. See https://napoveda.youtrack.cloud/issue/TOOLS-139"
  }' \
  "https://jules.googleapis.com/v1alpha/sessions" > pr87_retry3.json

# 2. Launch TOOLS-145 (Watchdog)
echo "Launching TOOLS-145..."
curl -s -X POST -H "x-goog-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Implement `jules-watchdog` CLI tool (Feature: Auto-Reconciliation Watchdog). Repo: simik394/osobni_wf. Base: main. It should check GitHub PR status vs Jules Session status. If Session == COMPLETED but PR == CONFLICTING or NO NEW COMMITS, flag it. See https://napoveda.youtrack.cloud/issue/TOOLS-145. Implement in `agents/jules-go/cmd/jules-watchdog` and add to Makefile."
  }' \
  "https://jules.googleapis.com/v1alpha/sessions" > tools145.json

echo "Done."
