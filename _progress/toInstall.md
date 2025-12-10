# CopyQ

This section outlines the steps to install CopyQ, a cross-platform clipboard manager.

```/dev/null/install_script.sh#L1-5
sudo apt install software-properties-common python-software-properties
sudo add-apt-repository ppa:hluk/copyq
sudo apt update
sudo apt install copyq
# this package contains all plugins and documentation
```

# Google Chrome

This script automates the installation of Google Chrome Stable on Debian/Ubuntu-based systems.

```/dev/null/install_script.sh#L1-37
#!/bin/bash

# URL oficiálního stabilního sestavení pro Linux (Debian/Ubuntu)
CHROME_URL="https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb"
TEMP_DEB="/tmp/google-chrome-stable_current_amd64.deb"

echo "--- Instalace Google Chrome ---"

# 1. Stažení balíčku
echo "Stahuji nejnovější .deb balíček..."
if command -v wget &> /dev/null; then
    wget -O "$TEMP_DEB" "$CHROME_URL"
else
    echo "Chyba: 'wget' není nainstalován. Instaluji..."
    sudo apt update && sudo apt install -y wget
    wget -O "$TEMP_DEB" "$CHROME_URL"
fi

# Kontrola stažení
if [ ! -f "$TEMP_DEB" ]; then
    echo "Chyba: Stažení se nezdařilo."
    exit 1
fi

# 2. Instalace pomocí APT
# Používáme 'apt install' namísto 'dpkg -i', protože apt
# automaticky vyřeší případné chybějící závislosti.
echo "Instaluji balíček (vyžaduje sudo)..."
sudo apt install -y "$TEMP_DEB"

# 3. Úklid
echo "Mažu dočasný soubor..."
rm "$TEMP_DEB"

echo "--- HOTOVO ---"
echo "Google Chrome byl nainstalován a přidán do repozitářů pro aktualizace."
echo "Najdete ho v menu aplikací."
```

# Chromite

(No installation steps provided for Chromite.)

# install-bin.sh (Generic App Installer)

This script creates a `.desktop` file for any binary/AppImage, integrating it into the application menu (GNOME/Cosmic/KDE).

```/dev/null/install_script.sh#L1-100
#!/bin/bash

# ==============================================================================
# NÁZEV:        Linux App Installer & Desktop Entry Generator
# POPIS:        Vytvoří spustitelný .desktop soubor pro libovolnou binárku/AppImage,
#               čímž ji integruje do menu aplikací (GNOME/Cosmic/KDE).
#
# POUŽITÍ:      ./install_app.sh [CESTA_K_APLIKACI] [CESTA_K_IKONĚ]
#
# ARGUMENTY:
#   $1 (Povinný): Cesta ke spustitelnému souboru (AppImage, binárka, skript).
#   $2 (Volitelný): Cesta k .png/.svg ikoně.
#                   Pokud není zadána, skript se pokusí najít ikonu se stejným
#                   názvem ve stejné složce. Pokud nenajde, použije systémovou.
#
# PŘÍKLADY:
#   1. Základní (ikona se dohledá automaticky nebo se použije default):
#      ./install_app.sh ~/Downloads/MujProgram.AppImage
#
#   2. S explicitní ikonou:
#      ./install_app.sh ~/Downloads/MujProgram.AppImage ~/Downloads/logo.png
#
# AUTOR:        Gemini (pro User Context: Cognitive Informatics Master)
# DATUM:        2025-11-22
# ==============================================================================

# --- Funkce pro nápovědu ---
function show_help() {
    sed -rn 's/^# ?//;3,20p' "$0"
}

# Pokud uživatel zadá --help nebo -h
if [[ "$1" == "--help" ]] || [[ "$1" == "-h" ]]; then
    show_help
    exit 0
fi

# --- 1. Validace vstupu ---
if [ -z "$1" ]; then
    echo "CHYBA: Chybí cesta k aplikaci."
    echo "Zkuste: $0 --help"
    exit 1
fi

# Proměnné cesty a názvu
APP_PATH=$(realpath "$1")
APP_DIR=$(dirname "$APP_PATH")
APP_FILENAME=$(basename "$APP_PATH")
APP_NAME="${APP_FILENAME%.*}" # Odstraní příponu (např. .AppImage)
USER_ICON_ARG="${2:-}"         # Druhý argument, může být prázdný

DEST_DIR="$HOME/.local/share/applications"
DESKTOP_FILE="$DEST_DIR/${APP_NAME}.desktop"

# Kontrola existence aplikace
if [ ! -f "$APP_PATH" ]; then
    echo "CHYBA: Soubor aplikace '$APP_PATH' neexistuje."
    exit 1
fi

# --- 2. Logika pro výběr Ikony (Heuristika) ---
FINAL_ICON=""

# A) Uživatel zadal cestu k ikoně ručně
if [ -n "$USER_ICON_ARG" ]; then
    if [ -f "$USER_ICON_ARG" ]; then
        FINAL_ICON=$(realpath "$USER_ICON_ARG")
        echo "Info: Používám zadanou ikonu: $FINAL_ICON"
    else
        echo "Varování: Zadaná ikona neexistuje. Zkusím automatickou detekci."
    fi
fi

# B) Pokud ikona nebyla zadána (nebo nebyla nalezena), zkus najít obrázek se stejným názvem ve složce aplikace
if [ -z "$FINAL_ICON" ]; then
    # Hledá soubory jako AppName.png nebo AppName.svg ve stejné složce
    AUTO_ICON=$(find "$APP_DIR" -maxdepth 1 -name "${APP_NAME}.*" \( -name "*.png" -o -name "*.svg" \) | head -n 1)
    
    if [ -n "$AUTO_ICON" ]; then
        FINAL_ICON="$AUTO_ICON"
        echo "Info: Automaticky nalezena ikona: $FINAL_ICON"
    fi
fi

# C) Fallback na systémovou ikonu
if [ -z "$FINAL_ICON" ]; then
    FINAL_ICON="system-run" # Generická ikona ozubeného kola/terminálu
    echo "Info: Ikona nenalezena. Používám systémový placeholder 'system-run'."
fi


# --- 3. Instalace ---

# Nastavení práv spustitelnosti
if [ ! -x "$APP_PATH" ]; then
    echo "Nastavuji práva +x pro aplikaci..."
    chmod +x "$APP_PATH"
fi

echo "Generuji $DESKTOP_FILE ..."

# Zápis obsahu
cat > "$DESKTOP_FILE" <<EOF
[Desktop Entry]
Type=Application
Name=$APP_NAME
Comment=Nainstalováno ručně skriptem
Exec="$APP_PATH"
Icon=$FINAL_ICON
Terminal=false
Categories=Utility;
StartupNotify=true
EOF

# --- 4. Refresh systému ---
update-desktop-database "$DEST_DIR" 2>/dev/null

echo " "
echo "✅ HOTOVO. Aplikace '$APP_NAME' je nainstalována."
echo "📍 Soubor: $DESKTOP_FILE"
echo "💡 Nyní stiskněte klávesu Super (Windows) a napište '$APP_NAME'."
```

# Neovim

This script installs the stable version of Neovim via its PPA.

```/dev/null/install_script.sh#L1-13
#!/bin/bash

## 1. Instalace prerekvizit pro správu repozitářů
sudo apt update
sudo apt install -y software-properties-common

## 2. Přidání "stable" PPA pro Neovim (zaručuje aktuální stable verzi, např. 0.10.x)
`# Pokud bys chtěl nightly (dev) verzi, změň 'stable' na 'unstable'`
`sudo add-apt-repository -y ppa:neovim-ppa/stable`

## 3. Update a instalace
`sudo apt update`
`sudo apt install -y neovim`

## 4. Ověření verze
nvim --version | head -n 1
```

# npm

To install: `npm`

# Node.js

To install: `node`

# Gemini

To install: `gemini`

# WezTerm

To install: `wezterm`

# Alacritty

To install: `alacritty`

# Vial

This command sets up udev rules for Vial devices, ensuring proper permissions.

```/dev/null/config.sh#L1-1
export USER_GID=`id -g`; sudo --preserve-env=USER_GID sh -c 'echo "KERNEL==\"hidraw*\", SUBSYSTEM==\"hidraw\", ATTRS{serial}==\"*vial:f64c2b3c*\", MODE=\"0660\", GROUP=\"$USER_GID\", TAG+=\"uaccess\", TAG+=\"udev-acl\"" > /etc/udev/rules.d/59-vial.rules && udevadm control --reload && udevadm trigger'
```

# OBS Studio

To install: `obs`

# Zed Editor

To install: `zed`

# Postman

To install: `postman`

# tmux

To install: `tmux`

# Active Window Logger

To install: `activeWindowLoger`

# OpenCode

To install: `opencode`

# Crush

To install: `crush`

# Digikam

To install: `digikam`

# Agor

To install: `agor`
