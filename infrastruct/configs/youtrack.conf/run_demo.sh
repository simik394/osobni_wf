#!/bin/bash
# Helper script to run YouTrack IaC demo in dry-run mode

if [ -z "$YOUTRACK_TOKEN" ]; then
    echo "❌ Error: YOUTRACK_TOKEN environment variable is not set."
    echo "Please export your permanent token first:"
    echo "  export YOUTRACK_TOKEN=perm:..."
    exit 1
fi

URL=$1
if [ -z "$URL" ]; then
    echo "❌ Error: YouTrack URL is required as the first argument."
    echo "Usage: ./run_demo.sh https://your-instance.youtrack.cloud"
    exit 1
fi

echo "🚀 Running YouTrack IaC Demo (Dry Run) against $URL..."
echo "Configuration: obsidian-rules/demo.yaml"
echo "---------------------------------------------------"

python3 -m src.controller.main \
  --youtrack-url "$URL" \
  --config-dir "obsidian-rules" \
  --dry-run \
  --verbose
