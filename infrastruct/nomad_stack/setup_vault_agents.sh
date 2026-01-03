#!/bin/bash
# Setup Vault secrets for agent services
# Run this script after logging into Vault (source vault_login.sh first)
set -e

VAULT_ADDR="${VAULT_ADDR:-http://100.73.45.27:8200}"
export VAULT_ADDR

echo "🔐 Setting up Vault secrets for agents..."
echo "   Vault: $VAULT_ADDR"

# Check if logged in
if ! vault token lookup > /dev/null 2>&1; then
    echo "❌ Not logged into Vault. Run: source vault_login.sh"
    exit 1
fi

# Enable KV v2 secrets engine (if not already)
echo "📦 Enabling KV v2 secrets engine..."
vault secrets enable -path=secret kv-v2 2>/dev/null || echo "   (already enabled)"

# Apply agents policy
POLICY_FILE="$(dirname "$0")/roles/nomad_jobs/files/policy-agents.hcl"
if [ -f "$POLICY_FILE" ]; then
    echo "📜 Applying 'agents' policy..."
    vault policy write agents "$POLICY_FILE"
else
    echo "⚠️  Policy file not found at $POLICY_FILE"
fi

# Prompt for Windmill token
echo ""
echo "🌀 Windmill Token Setup"
echo "   Get your token from: http://windmill.100.73.45.27.nip.io/user/settings/tokens"
read -p "   Enter WINDMILL_TOKEN (or press Enter to skip): " WINDMILL_TOKEN

if [ -n "$WINDMILL_TOKEN" ]; then
    vault kv put secret/agents/windmill token="$WINDMILL_TOKEN"
    echo "   ✅ Windmill secret stored"
else
    echo "   ⏭️  Skipped (set later with: vault kv put secret/agents/windmill token=<TOKEN>)"
fi

# Prompt for Langfuse keys
echo ""
echo "📊 Langfuse Keys Setup"
read -p "   Enter LANGFUSE_PUBLIC_KEY (or press Enter to skip): " LANGFUSE_PUBLIC_KEY
read -p "   Enter LANGFUSE_SECRET_KEY (or press Enter to skip): " LANGFUSE_SECRET_KEY

if [ -n "$LANGFUSE_PUBLIC_KEY" ] && [ -n "$LANGFUSE_SECRET_KEY" ]; then
    vault kv put secret/agents/langfuse \
        public_key="$LANGFUSE_PUBLIC_KEY" \
        secret_key="$LANGFUSE_SECRET_KEY"
    echo "   ✅ Langfuse secrets stored"
else
    echo "   ⏭️  Skipped"
fi

echo ""
echo "✅ Vault setup complete!"
echo ""
echo "Next steps:"
echo "  1. Redeploy jobs: nomad job run /opt/nomad/jobs/rsrch.nomad.hcl"
echo "  2. Check secrets: vault kv get secret/agents/windmill"
