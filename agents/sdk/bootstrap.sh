#!/bin/bash
# Agentic SDK Bootstrap
SDK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export PATH="$SDK_DIR/bin:$PATH"

# Ensure signaling directories exist
mkdir -p "$SDK_DIR/../../.jules/mcp/requests"
mkdir -p "$SDK_DIR/../../.jules/mcp/responses"

echo "Agentic SDK Bridge Initialized."
echo "--------------------------------------------------------"
echo "ATTENTION: All agents MUST adhere to the Orchestration Protocol:"
echo "Location: docs/automation_standards.md"
echo "Failure to comply will result in task failure or loops."
echo "--------------------------------------------------------"
echo "Commands available: yt"
