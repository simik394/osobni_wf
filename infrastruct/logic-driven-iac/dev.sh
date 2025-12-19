#!/bin/bash
# dev.sh - Run Logic-Driven IaC development environment
# Usage: ./dev.sh [command]
#   ./dev.sh        - Start interactive shell
#   ./dev.sh test   - Run all tests
#   ./dev.sh pytest - Run Python tests only
#   ./dev.sh prolog - Run Prolog tests only

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IMAGE_NAME="ldi-devcontainer"

# Build if image doesn't exist
if ! docker image inspect "$IMAGE_NAME" &>/dev/null; then
    echo "Building dev container image..."
    docker build -t "$IMAGE_NAME" -f "$SCRIPT_DIR/.devcontainer/Dockerfile" "$SCRIPT_DIR"
fi

# Run command
case "${1:-shell}" in
    test)
        echo "Running all tests..."
        docker run --rm \
            -v "$SCRIPT_DIR:/workspaces/logic-driven-iac" \
            -w /workspaces/logic-driven-iac \
            "$IMAGE_NAME" bash -c "
                sudo pip3 install --break-system-packages -q -r requirements.txt && \
                echo '=== Python Tests ===' && \
                pytest -v && \
                echo && \
                echo '=== Prolog Tests ===' && \
                swipl -g run_tests -t halt tests/test_logic.pl
            "
        ;;
    pytest)
        echo "Running Python tests..."
        docker run --rm \
            -v "$SCRIPT_DIR:/workspaces/logic-driven-iac" \
            -w /workspaces/logic-driven-iac \
            "$IMAGE_NAME" bash -c "
                sudo pip3 install --break-system-packages -q -r requirements.txt && \
                pytest -v
            "
        ;;
    prolog)
        echo "Running Prolog tests..."
        docker run --rm \
            -v "$SCRIPT_DIR:/workspaces/logic-driven-iac" \
            -w /workspaces/logic-driven-iac \
            "$IMAGE_NAME" bash -c "
                swipl -g run_tests -t halt tests/test_logic.pl
            "
        ;;
    shell|*)
        echo "Starting interactive shell..."
        docker run -it --rm \
            -v "$SCRIPT_DIR:/workspaces/logic-driven-iac" \
            -w /workspaces/logic-driven-iac \
            "$IMAGE_NAME" bash
        ;;
esac
