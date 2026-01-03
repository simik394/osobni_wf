#!/bin/bash
set -e

# Configuration
VAULT_ADDR="${VAULT_ADDR:-http://100.73.45.27:8200}"
VAULT_PATH="secret/data/gemini"
SECRET_KEY="api_key"

export VAULT_ADDR

echo "🔐 Fetching API key from Vault ($VAULT_ADDR)..."

# Check if vault is installed
if ! command -v vault &> /dev/null; then
    echo "❌ Error: 'vault' CLI is not installed."
    exit 1
fi

# Try to get the secret
# We use -field=data to get the json payload, and then extract the key
# Or if using vault kv get:
if ! API_KEY=$(vault kv get -mount=secret -field="$SECRET_KEY" "gemini"); then
    echo "❌ Failed to fetch secret. Please ensure:"
    echo "   1. You are logged in: 'vault login'"
    echo "   2. The secret exists: 'vault kv put secret/gemini api_key=YOUR_KEY'"
    exit 1
fi

echo "✅ Key retrieved successfully."

# Export and run
export GEMINI_API_KEY="$API_KEY"
python3 "$(dirname "$0")/gemini_token_counter.py" "$@"
