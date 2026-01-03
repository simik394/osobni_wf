#!/bin/bash
set -e

# Configuration
VAULT_KEYS_FILE="$(git rev-parse --show-toplevel)/infrastruct/nomad_stack/vault_keys.json"
VAULT_ADDR="${VAULT_ADDR:-http://100.73.45.27:8200}"

if [ ! -f "$VAULT_KEYS_FILE" ]; then
    echo "❌ Error: Vault keys file not found at $VAULT_KEYS_FILE"
    exit 1
fi

echo "🔓 Logging in to Vault using root token from keys file..."
echo "   File: $VAULT_KEYS_FILE"
echo "   Addr: $VAULT_ADDR"

# Extract token using grep/sed to avoid jq dependency if possible, or python
# "root_token": "hvs.Li..."
ROOT_TOKEN=$(grep -o '"root_token": "[^"]*"' "$VAULT_KEYS_FILE" | cut -d'"' -f4)

if [ -z "$ROOT_TOKEN" ]; then
    echo "❌ Error: Could not extract root_token from file."
    exit 1
fi

# Login
export VAULT_ADDR="$VAULT_ADDR"
vault login "$ROOT_TOKEN"

echo ""
echo "✅ Successfully logged in as root!"
echo "   Token saved to ~/.vault-token"
