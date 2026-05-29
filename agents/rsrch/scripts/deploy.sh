#!/bin/bash
# --- The Ultimate rsrch Deployment Script ---
# This script is intended to be run on halvarm (the target server).
# It automates the local build of Docker images and Nomad job updates.

set -e

REPO_ROOT="/home/ubuntu/Prods/01pwf"
APP_DIR="${REPO_ROOT}/agents/rsrch"
REGISTRY="localhost:5001"
IMAGE_NAME="rsrch"
NOMAD_JOB="rsrch"

echo "🚀 [Deploy] Starting deployment from ${APP_DIR}..."

cd "${REPO_ROOT}"

# 1. Update source code (assuming this script is called after a git pull/push)
# If this is called from a post-receive hook, the code is already updated in the work-tree.

# 2. Build Shared Library (since rsrch depends on it)
echo "📦 [Deploy] Building @agents/shared..."
cd agents/shared
npm install --silent
npm run build

# 3. Build rsrch Docker Image
echo "🐳 [Deploy] Building Docker image: ${REGISTRY}/${IMAGE_NAME}:latest..."
cd "${APP_DIR}"
# Note: Docker context is 'agents' to allow access to '../shared'
docker build -t "${REGISTRY}/${IMAGE_NAME}:latest" -f Dockerfile ../

# 4. Push to Local Registry
echo "⬆️ [Deploy] Pushing to local registry..."
docker push "${REGISTRY}/${IMAGE_NAME}:latest"

# 5. Update Nomad Job
echo "🏗️ [Deploy] Triggering Nomad job update..."
# We use 'nomad job restart' which is the cleanest way to cycle the containers with the new image
nomad job restart "${NOMAD_JOB}"

echo "✅ [Deploy] Finished successfully!"
