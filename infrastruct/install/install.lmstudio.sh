#!/bin/bash

# ==============================================================================
# NÁZEV:        LM Studio Installer/Updater
# POPIS:        Automaticky detekuje a nainstaluje nejnovější verzi LM Studia
#               pomocí existující Ansible role.
#
# AUTOR:        Gemini
# DATUM:        2026-01-10
# ==============================================================================

set -e

# --- 1. Detekce cesty k projektu ---
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "--- LM Studio: Kontrola a aktualizace ---"

# --- 2. Kontrola závislostí ---
if ! command -v ansible-playbook &> /dev/null; then
    echo "CHYBA: ansible-playbook nebyl nalezen. Nainstalujte jej prosím."
    exit 1
fi

# --- 3. Spuštění Ansible playbooku ---
echo "Spouštím Ansible role pro LM Studio..."
cd "$PROJECT_ROOT"
ansible-playbook -i infrastruct/ansible/inventory.yml \
                 infrastruct/ansible/setup_local.yml \
                 --tags lmstudio

echo "---"
echo "✅ HOTOVO. LM Studio by mělo být nainstalováno/aktualizováno."
echo "   Cesta k souboru: ~/.local/share/lmstudio/"
echo "   Symlink: ~/.local/bin/lmstudio"
