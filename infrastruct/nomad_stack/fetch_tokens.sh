#!/bin/bash
set -e

# Configuration
SERVER_HOST="halvarm" # Host where containers are running
GENERATED_WM_TOKEN="wt_$(openssl rand -hex 16)"

echo "🔍 Provisioning/Fetching tokens via direct DB access..."
echo ""

# -----------------------------------------------------------------------------
# 1. Provision Windmill Token
# -----------------------------------------------------------------------------
echo "1. Windmill Token"
echo "   Checking Windmill database on $SERVER_HOST..."

# Check if we already have a provisioned token or insert a new one
# We target workspace 'admins' (default for admin@windmill.dev usually) or 'main' if exists.
# Based on investigation: user=admin@windmill.dev, workspace=admins.
# We'll try to find an existing token first.
WM_DB_CMD="docker exec \$(docker ps -q -f ancestor=postgres:14) psql -U windmill -d windmill -t"
EXISTING_TOKEN=$(ssh "$SERVER_HOST" "$WM_DB_CMD -c \"SELECT token FROM token WHERE email='admin@windmill.dev' LIMIT 1;\"" 2>/dev/null | xargs || true)

if [ -n "$EXISTING_TOKEN" ]; then
    echo "   ✅ Found existing token: $EXISTING_TOKEN"
    WM_TOKEN="$EXISTING_TOKEN"
else
    echo "   ⚙️  Creating new token ($GENERATED_WM_TOKEN)..."
    # Insert new token. explicit workspace 'admins'
    ssh "$SERVER_HOST" "$WM_DB_CMD -c \"INSERT INTO token (token, owner, email, workspace_id, super_admin, created_at, last_used_at) VALUES ('$GENERATED_WM_TOKEN', 'admin', 'admin@windmill.dev', 'admins', true, NOW(), NOW());\""
    WM_TOKEN="$GENERATED_WM_TOKEN"
    echo "   ✅ Token created."
fi

echo "WINDMILL_TOKEN=$WM_TOKEN" > .tokens.env


# -----------------------------------------------------------------------------
# 2. Fetch Langfuse Keys
# -----------------------------------------------------------------------------
echo ""
echo "2. Langfuse Keys"
echo "   Querying Langfuse database..."

LF_DB_CMD="docker exec langfuse-postgres-1 psql -U langfuse -d langfuse -t"
# We can only get public key. Secret key is hashed.
KEYS_RAW=$(ssh "$SERVER_HOST" "$LF_DB_CMD -c \"SELECT public_key FROM api_keys LIMIT 1;\"" 2>/dev/null || true)
LANGFUSE_PK=$(echo "$KEYS_RAW" | xargs)

if [ -n "$LANGFUSE_PK" ]; then
    echo "   ✅ Found Public Key: $LANGFUSE_PK"
    echo "   ⚠️  Secret Key is hashed in DB. You must provide it manually or use the UI."
    echo "LANGFUSE_PUBLIC_KEY=$LANGFUSE_PK" >> .tokens.env
    # We leave SECRET_KEY empty to prompt user or force UI lookup
else
    echo "   ⚠️  No API keys found in Langfuse."
fi

echo ""
echo "---------------------------------------------------"
echo "📝 Tokens saved to .tokens.env"
echo "   Run './setup_vault_agents.sh --auto' to upload."
if [ -z "$LANGFUSE_PK" ]; then
    echo "   (Note: Langfuse keys missing)"
fi
