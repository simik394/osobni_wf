#!/bin/bash

# ==============================================================================
# NÁZEV:        Obsidian Installer (Ansible Ready)
# POPIS:        Stáhne a nainstaluje nejnovější verzi Obsidianu z GitHubu.
#               Je idempotentní (neinstaluje znovu stejnou verzi).
#               Automaticky detekuje sudo/root.
#
# AUTOR:        Gemini
# DATUM:        2025-11-22
# ==============================================================================

set -e

# --- 1. Detekce oprávnění ---
if [ "$EUID" -eq 0 ]; then
    SUDO_CMD=""
else
    SUDO_CMD="sudo"
fi

echo "--- Kontrola verze Obsidianu ---"

# --- 2. Získání nejnovější verze z GitHubu ---
LATEST_JSON=$(curl -s https://api.github.com/repos/obsidianmd/obsidian-releases/releases/latest)
DOWNLOAD_URL=$(echo "$LATEST_JSON" | grep "browser_download_url" | grep "_amd64.deb" | cut -d '"' -f 4)
# Získání verze z tagu (např. "v1.4.16" -> "1.4.16")
LATEST_VERSION=$(echo "$LATEST_JSON" | grep '"tag_name":' | sed -E 's/.*"tag_name": "v?([^"]+)".*/\1/')

if [ -z "$DOWNLOAD_URL" ] || [ -z "$LATEST_VERSION" ]; then
    echo "CHYBA: Nepodařilo se získat informace o nejnovější verzi z GitHub API."
    exit 1
fi

echo "Nejnovější dostupná verze: $LATEST_VERSION"

# --- 3. Získání nainstalované verze ---
INSTALLED_VERSION=""
if command -v dpkg-query &> /dev/null; then
    # dpkg-query vrátí verzi nebo chybu, pokud balíček neexistuje
    if DPKG_OUT=$(dpkg-query -W -f='${Version}' obsidian 2>/dev/null); then
        INSTALLED_VERSION="$DPKG_OUT"
    fi
fi

echo "Nainstalovaná verze: ${INSTALLED_VERSION:-není nainstalováno}"

# --- 4. Porovnání a rozhodnutí ---
if [ "$INSTALLED_VERSION" == "$LATEST_VERSION" ]; then
    echo "✅ Obsidian je již aktuální ($INSTALLED_VERSION). Přeskakuji instalaci."
    exit 0
fi

echo "--- Zahajuji instalaci/aktualizaci ($LATEST_VERSION) ---"

# --- 5. Stažení a instalace ---
FILENAME=$(basename "$DOWNLOAD_URL")
TEMP_DEB="/tmp/$FILENAME"

echo "Stahuji: $DOWNLOAD_URL"
wget -q -O "$TEMP_DEB" "$DOWNLOAD_URL"

if [ ! -f "$TEMP_DEB" ]; then
    echo "CHYBA: Stažení se nezdařilo."
    exit 1
fi

echo "Instaluji balíček..."
# DEBIAN_FRONTEND=noninteractive pro tichou instalaci bez dialogů
$SUDO_CMD DEBIAN_FRONTEND=noninteractive apt install -y "$TEMP_DEB"

# --- 6. Úklid ---
rm "$TEMP_DEB"

echo "✅ HOTOVO. Obsidian $LATEST_VERSION byl nainstalován."
