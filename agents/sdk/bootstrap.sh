#!/bin/bash
# Agentic SDK Bootstrap
SDK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export PATH="$SDK_DIR/bin:$PATH"

# Ensure signaling directories exist
mkdir -p "$SDK_DIR/../../.jules/mcp/requests"
mkdir -p "$SDK_DIR/../../.jules/mcp/responses"

# --- Lean 4 Integration (Opponent Role) ---
if ! command -v lean &> /dev/null; then
    echo "Lean 4 not found. Installing elan & lean4:stable..."
    # Non-interactive elan install
    curl https://raw.githubusercontent.com/leanprover/elan/master/elan-init.sh -sSf | sh -s -- -y --default-toolchain leanprover/lean4:stable > /dev/null 2>&1
fi
# Always source elan env to ensure PATH is correct
[ -f "$HOME/.elan/env" ] && source "$HOME/.elan/env"

echo "Agentic SDK Bridge Initialized."
echo "--------------------------------------------------------"
echo "ATTENTION: All agents MUST adhere to the Orchestration Protocol:"
echo "Location: docs/automation_standards.md"
echo "Failure to comply will result in task failure or loops."
echo "--------------------------------------------------------"
echo "Commands available: yt"
