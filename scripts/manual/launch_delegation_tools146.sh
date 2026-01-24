#!/bin/bash
API_KEY="AQ.Ab8RN6Jsuhl61jeZvjhOcIiZk3TzaeC-JRE58y5pJP32yA4KIw"

# Launch TOOLS-146 (Fleet Commander)
echo "Launching TOOLS-146..."
curl -s -X POST -H "x-goog-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Implement `jules-fleet` CLI tool (Feature: Jules Fleet Commander). Repo: simik394/osobni_wf. Base: main. It should allow bulk operations on sessions. Subcommands: `retry --reason X --ids 1,2,3`, `approve --all-completed`, `nuke --stale > 24h`. See https://napoveda.youtrack.cloud/issue/TOOLS-146. Implement in `agents/jules-go/cmd/jules-fleet` and add to Makefile."
  }' \
  "https://jules.googleapis.com/v1alpha/sessions" > tools146.json

echo "Done."
