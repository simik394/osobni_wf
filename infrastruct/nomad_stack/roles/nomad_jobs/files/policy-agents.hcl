# Vault policy for agent services
# Allows read access to agent secrets (Windmill token, Langfuse keys, etc.)

path "secret/data/agents/*" {
    capabilities = ["read"]
}

# Allow listing secrets (for debugging)
path "secret/metadata/agents/*" {
    capabilities = ["list"]
}
