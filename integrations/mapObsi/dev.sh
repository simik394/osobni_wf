#!/bin/bash
# dev.sh - Run mapObsi in a container with tree-sitter
# Usage: 
#   ./dev.sh scan VAULT=path    - Scan changed files
#   ./dev.sh full VAULT=path    - Full rescan  
#   ./dev.sh shell              - Interactive shell

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IMAGE_NAME="mapobsi-dev"

# Build if needed
if ! docker image inspect "$IMAGE_NAME" &>/dev/null; then
    echo "Building container..."
    docker build -t "$IMAGE_NAME" -f - "$SCRIPT_DIR" <<'EOF'
FROM python:3.11-slim
RUN apt-get update && apt-get install -y --no-install-recommends make findutils git && rm -rf /var/lib/apt/lists/*
RUN pip install --no-cache-dir 'tree-sitter==0.21.3' tree-sitter-languages python-frontmatter
WORKDIR /app
EOF
fi

# Run make command inside container
docker run --rm \
    -v "$SCRIPT_DIR:/app" \
    -v "$SCRIPT_DIR/../..:/vault:ro" \
    -w /app \
    "$IMAGE_NAME" \
    make "${@:-help}"
