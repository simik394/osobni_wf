#!/bin/bash

# ==============================================================================
# NÁZEV:        Gemini CLI - Dependency Installer
# POPIS:        Instaluje pouze runtime (Node.js) a systémové knihovny.
#               Neinstaluje samotný gemini-cli.
# ==============================================================================

echo "--- Příprava závislostí pro Gemini CLI ---"

# 1. Základní transportní nástroje (pro stahování repozitářů)
echo "[1/4] Instaluji curl a certifikáty..."
sudo apt update
sudo apt install -y curl ca-certificates gnupg

# 2. Příprava NodeSource repozitáře (pro nejnovější Node.js LTS)
# Oficiální repozitáře Pop!_OS mohou mít starý Node.js (např. v12 nebo v18).
# Gemini CLI vyžaduje Node v20+.
echo "[2/4] Konfiguruji Node.js 22.x (LTS)..."
if [ ! -f /etc/apt/sources.list.d/nodesource.list ]; then
    mkdir -p /etc/apt/keyrings
    curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | sudo gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
    echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main" | sudo tee /etc/apt/sources.list.d/nodesource.list
    sudo apt update
else
    echo " -> NodeSource repozitář již existuje."
fi

# 3. Instalace Node.js (obsahuje NPM) a Build Tools
echo "[3/4] Instaluji Node.js, NPM a build-essential..."
# build-essential je 'make', 'g++' atd. - nutné pro některé npm balíčky s nativním kódem
sudo apt install -y nodejs build-essential

# 4. Instalace Linux GUI utilit (Kritické pro Auth)
echo "[4/4] Instaluji xdg-utils (pro otevírání prohlížeče)..."
# Bez tohoto příkaz 'gemini login' na Linuxu spadne nebo nic neudělá.
sudo apt install -y xdg-utils

echo " "
echo "--- HOTOVO ---"
echo "Verze Node.js (požadováno 20+): $(node -v)"
echo "Verze NPM: $(npm -v)"
echo " "
echo "Nyní můžeš nainstalovat aplikaci příkazem:"
echo "sudo npm install -g @google/gemini-cli"