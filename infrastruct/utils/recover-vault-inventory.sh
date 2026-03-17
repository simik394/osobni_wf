#!/bin/bash

# Script to inventory secrets and Vault paths after a data loss event.
# Targets: local machine and halvarm server.

OUTPUT_FILE="vault_recovery_inventory_$(date +%Y%m%d_%H%M%S).log"
PROJECT_DIR="$HOME/Obsi/Prods/01-pwf"

echo "=== Vault Secret Recovery Inventory ===" | tee -a "$OUTPUT_FILE"
echo "Generated on: $(date)" | tee -a "$OUTPUT_FILE"

echo -e "\n[1/4] Searching LOCAL shell history for 'vault kv put'..." | tee -a "$OUTPUT_FILE"
# Search .zsh_history and .bash_history (handling ZSH timestamp format)
grep -a "vault kv put" ~/.zsh_history ~/.bash_history 2>/dev/null | sed 's/^: [0-9]*:[0-9];//' | sort -u >> "$OUTPUT_FILE"

echo -e "\n[2/4] Searching REMOTE (halvarm) shell history for 'vault kv put'..." | tee -a "$OUTPUT_FILE"
ssh halvarm "cat ~/.zsh_history ~/.bash_history 2>/dev/null | grep -a 'vault kv put'" | sed 's/^: [0-9]*:[0-9];//' | sort -u >> "$OUTPUT_FILE"

echo -e "\n[3/4] Searching PROJECT FILES for Vault paths (kv get)..." | tee -a "$OUTPUT_FILE"
grep -r "vault kv get" "$PROJECT_DIR" --exclude-dir=.git 2>/dev/null | sort -u >> "$OUTPUT_FILE"

echo -e "\n[4/4] Locating all .env files in infrastructure and projects..." | tee -a "$OUTPUT_FILE"
find "$PROJECT_DIR" -name "*.env" -not -path "*/node_modules/*" >> "$OUTPUT_FILE"
ssh halvarm "find ~ -name '.env' -o -name 'docker-compose.yml' 2>/dev/null" >> "$OUTPUT_FILE"

echo -e "\n=== FINISHED ===" | tee -a "$OUTPUT_FILE"
echo "Results saved to: $OUTPUT_FILE"
