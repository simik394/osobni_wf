#!/bin/bash

# Zastaví skript při chybě
set -e

echo "[INFO] 🚀 Zahajuji transformaci na Zsh..."

# 1. Instalace prerekvizit (Zsh, Git, Curl)
echo "[INFO] Kontrola a instalace balíčků..."
if ! command -v zsh &> /dev/null; then
    sudo apt update && sudo apt install -y zsh git curl
    echo "[OK] Zsh nainstalován."
else
    echo "[INFO] Zsh již existuje."
fi

# 2. Záloha existujícího .zshrc
if [ -f "$HOME/.zshrc" ]; then
    cp "$HOME/.zshrc" "$HOME/.zshrc.backup.$(date +%s)"
    echo "[INFO] Starý .zshrc zálohován."
fi

# 3. Instalace Oh My Zsh (bezobslužná instalace)
# OMZ je framework, který dává Zsh strukturu.
if [ ! -d "$HOME/.oh-my-zsh" ]; then
    echo "[INFO] Instaluji Oh My Zsh (177k ⭐)..."
    sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)" "" --unattended
else
    echo "[INFO] Oh My Zsh již je nainstalován."
fi

# 4. Instalace Fish-like pluginů
ZSH_CUSTOM="$HOME/.oh-my-zsh/custom"

# zsh-autosuggestions (31k ⭐)
if [ ! -d "$ZSH_CUSTOM/plugins/zsh-autosuggestions" ]; then
    echo "[INFO] Klonuji zsh-autosuggestions..."
    git clone https://github.com/zsh-users/zsh-autosuggestions ${ZSH_CUSTOM}/plugins/zsh-autosuggestions
fi

# zsh-syntax-highlighting (19k ⭐)
if [ ! -d "$ZSH_CUSTOM/plugins/zsh-syntax-highlighting" ]; then
    echo "[INFO] Klonuji zsh-syntax-highlighting..."
    git clone https://github.com/zsh-users/zsh-syntax-highlighting.git ${ZSH_CUSTOM}/plugins/zsh-syntax-highlighting
fi

# 5. Konfigurace .zshrc (Aktivace pluginů a Theme)
echo "[INFO] Generuji nový .zshrc..."

# Použijeme šablonu z OMZ a upravíme ji
cp "$HOME/.oh-my-zsh/templates/zshrc.zsh-template" "$HOME/.zshrc"

# Povolení pluginů v konfiguraci (sed command magic)
# Mění řádek plugins=(git) na plugins=(git zsh-autosuggestions zsh-syntax-highlighting)
sed -i 's/plugins=(git)/plugins=(git zsh-autosuggestions zsh-syntax-highlighting)/' "$HOME/.zshrc"

# 6. Import Aliasů z Bashe (Best Practice)
# Místo nebezpečného "source .bashrc" přidáme logiku pro načtení aliasů, pokud existují.
cat <<EOT >> "$HOME/.zshrc"

# --- BASH COMPATIBILITY LAYER ---
# Načtení aliasů z .bash_aliases (pokud existuje)
if [ -f ~/.bash_aliases ]; then
    source ~/.bash_aliases
fi

# Pokud máš v .bashrc exporty (PATH, ENV), doporučuji je přesunout do .zshenv nebo .profile
# Prozatím zkusíme načíst .profile, kde by měly být systémové cesty:
if [ -f ~/.profile ]; then
    source ~/.profile
fi
EOT

echo "[INFO] .zshrc nastaven. Pluginy aktivovány."

# 7. Nastavení Zsh jako default
CURRENT_SHELL=$(grep "^$USER" /etc/passwd | cut -d: -f7)
ZSH_PATH=$(which zsh)

if [ "$CURRENT_SHELL" != "$ZSH_PATH" ]; then
    echo "[INFO] Měním výchozí shell na Zsh..."
    chsh -s "$ZSH_PATH"
    echo "[SUCCESS] Hotovo. Odhlaš se a přihlaš zpět."
else
    echo "[INFO] Zsh už je tvůj výchozí shell."
fi

echo "[DONE] 🎉 Vítej v Zsh. Otevři nový terminál."
