#!/bin/bash
set -e

# Ensure we are in the script's directory
cd "$(dirname "$0")"

echo "=== Quick Docker Test Deployment ==="

# Create data directory if it doesn't exist
mkdir -p data

echo "[1/4] Building Docker images..."
docker compose build

echo "[2/4] Starting services..."
docker compose up -d

echo "[3/4] Checking status..."
sleep 2 # Wait a moment for containers to initialize
docker compose ps

echo "[4/4] Deployment ready!"
echo ""
echo "=== Usage Instructions ==="
echo "1. Authenticate (Required for first run):"
echo "   docker compose run --rm perplexity-server npm run auth"
echo "   -> Connect via VNC to localhost:5900 to log in manually."
echo "   -> Press ENTER in the terminal after logging in."
echo ""
echo "2. Run a test query (via HTTP API):"
echo "   curl -X POST http://localhost:3000/query \\"
echo "     -H 'Content-Type: application/json' \\"
echo "     -d '{\"query\": \"What is the speed of light?\"}'"
echo ""
echo "3. View logs:"
echo "   docker compose logs -f"
echo ""
echo "4. Stop and cleanup:"
echo "   docker compose down"
