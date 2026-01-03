#!/bin/bash
set -e

# Configuration
WINDMILL_URL="http://windmill.100.73.45.27.nip.io"
WINDMILL_USER="admin"
WINDMILL_PASS="changeme"
SERVER_HOST="halvarm" # Host where containers are running
LANGFUSE_COMPOSE_DIR="/home/ubuntu/langfuse"

echo "🔍 Fetching tokens from external services..."
echo ""

# -----------------------------------------------------------------------------
# 1. Fetch Windmill Token
# -----------------------------------------------------------------------------
echo "1. Windmill Token"
echo "   Attempting to login to $WINDMILL_URL as $WINDMILL_USER..."

# Try to login and extract token
WM_RESPONSE=$(curl -s -X POST "$WINDMILL_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"username\": \"$WINDMILL_USER\", \"password\": \"$WINDMILL_PASS\"}")

WM_TOKEN=""
if echo "$WM_RESPONSE" | grep -q "token"; then
    # Extract token assuming simple JSON structure (needs jq installed, or fallback)
    if command -v jq >/dev/null; then
        WM_TOKEN=$(echo "$WM_RESPONSE" | jq -r .token)
        # Check if login_token wrapper exists (older versions)
        if [ "$WM_TOKEN" = "null" ]; then
             WM_TOKEN=$(echo "$WM_RESPONSE" | jq -r .login_token)
        fi
        # Older versions might not return it directly, let's assume standard response
    else
        # Fallback using grep/sed
        WM_TOKEN=$(echo "$WM_RESPONSE" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
    fi
fi

if [ -n "$WM_TOKEN" ] && [ "$WM_TOKEN" != "null" ]; then
    echo "   ✅ Success! Token acquired."
    # Export for setup script
    echo "WINDMILL_TOKEN=$WM_TOKEN" > .tokens.env
else
    echo "   ⚠️  Failed to login. Manual intervention required."
    echo "   Response: $WM_RESPONSE"
fi

echo ""

# -----------------------------------------------------------------------------
# 2. Fetch Langfuse Keys
# -----------------------------------------------------------------------------
echo "2. Langfuse Keys"
echo "   Querying Langfuse database on $SERVER_HOST..."

# Create a SQL query script to execute inside the container
SQL_QUERY="SELECT public_key, secret_key FROM api_keys LIMIT 1;"

# SSH into host and run query inside docker container
# We assume the container service name is 'postgres' or similar from docker-compose
KEYS_RAW=$(ssh "$SERVER_HOST" "cd $LANGFUSE_COMPOSE_DIR && docker compose exec -T postgres psql -U langfuse -d langfuse -t -c \"$SQL_QUERY\"" 2>/dev/null || true)

# Parse output (format is usually:  pk-lf-xxx | sk-lf-xxx )
LANGFUSE_PK=$(echo "$KEYS_RAW" | grep "pk-lf-" | head -n1 | awk -F'|' '{print $1}' | xargs)
LANGFUSE_SK=$(echo "$KEYS_RAW" | grep "sk-lf-" | head -n1 | awk -F'|' '{print $2}' | xargs)

if [ -n "$LANGFUSE_PK" ] && [ -n "$LANGFUSE_SK" ]; then
    echo "   ✅ Success! Found Langfuse keys."
    echo "   Public Key: $LANGFUSE_PK"
    echo "   Secret Key: (hidden)"
    
    echo "LANGFUSE_PUBLIC_KEY=$LANGFUSE_PK" >> .tokens.env
    echo "LANGFUSE_SECRET_KEY=$LANGFUSE_SK" >> .tokens.env
else
    echo "   ⚠️  Failed to find keys. Langfuse might not be initialized or no project created."
    if [ -n "$KEYS_RAW" ]; then
        echo "   DB Output: $KEYS_RAW"
    fi
fi

echo ""
echo "---------------------------------------------------"
if [ -f .tokens.env ]; then
    echo "🎉 Tokens saved to .tokens.env"
    echo "   Run './setup_vault_agents.sh --auto' to use them."
else
    echo "❌ No tokens fetched."
fi
