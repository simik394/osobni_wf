#!/bin/bash
set -e

# Configuration
REMOTE_HOST="halvarm"
BUILD_CTX="/tmp/build-ctx"
APP_DIR="agents/rsrch"
IMAGE_NAME="localhost:5001/rsrch:v$(date +%s)"

echo "🚀 Starting deployment to $REMOTE_HOST..."

# 1. Prepare remote build context
echo "📂 Preparing remote build context..."
ssh $REMOTE_HOST "rm -rf $BUILD_CTX && mkdir -p $BUILD_CTX/agents"

# 2. Sync files
echo "🔄 Syncing files..."
rsync -avz package.json $REMOTE_HOST:$BUILD_CTX/
rsync -avz --exclude node_modules --exclude data ../shared $REMOTE_HOST:$BUILD_CTX/agents/
rsync -avz --exclude node_modules --exclude data . $REMOTE_HOST:$BUILD_CTX/agents/rsrch/

# 3. Build and Push Docker image
echo "🐳 Building Docker images (using cache)..."
ssh $REMOTE_HOST "cd $BUILD_CTX && docker build -f agents/rsrch/deploy/Dockerfile.server -t $IMAGE_NAME ."

echo "📤 Pushing images to local registry..."
ssh $REMOTE_HOST "docker push $IMAGE_NAME"

# 4. Deploy Nomad job
echo "🚀 Running Nomad job..."
ssh $REMOTE_HOST "sed -i 's|image = .*|image = \"$IMAGE_NAME\"|' $BUILD_CTX/$APP_DIR/deploy/rsrch.nomad && nomad job run $BUILD_CTX/$APP_DIR/deploy/rsrch.nomad"

# 5. Check status
echo "📊 Deployment status:"
ssh $REMOTE_HOST "nomad job status rsrch"

echo "✅ Deployment complete!"
