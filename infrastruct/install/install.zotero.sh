#!/bin/bash

# ==============================================================================
# NÁZEV:        Zotero Installer (Debian Package Wrapper)
# POPIS:        Stáhne oficiální tarball Zotero, zabalí ho do .deb balíčku
#               a nainstaluje pomocí apt.
#               Zajišťuje čistou odinstalaci a systémovou integraci.
#
# AUTOR:        Gemini
# DATUM:        2025-11-25
# ==============================================================================

set -e

# --- Konfigurace ---
ZOTERO_URL="https://www.zotero.org/download/client/dl?channel=release&platform=linux-x86_64"
WORK_DIR="/tmp/zotero_build_$(date +%s)"
PACKAGE_NAME="zotero"
ARCH="amd64"

# --- Pomocné funkce ---

log_info() {
    echo -e "\033[1;34m[INFO]\033[0m $1"
}

log_success() {
    echo -e "\033[1;32m[OK]\033[0m $1"
}

log_error() {
    echo -e "\033[1;31m[ERROR]\033[0m $1"
}

check_sudo() {
    if [ "$EUID" -ne 0 ]; then
        log_info "Tento skript vyžaduje oprávnění root pro instalaci."
        sudo -v
    fi
}

cleanup() {
    if [ -d "$WORK_DIR" ]; then
        log_info "Úklid pracovního adresáře..."
        sudo rm -rf "$WORK_DIR"
    fi
}

# Zajistit úklid při ukončení
trap cleanup EXIT

# --- Hlavní skript ---

check_sudo

# 1. Získání verze (Remote)
log_info "Zjišťuji nejnovější verzi Zotero..."
# Zotero přesměrovává na konkrétní soubor, získáme URL z hlavičky Location
# Příklad: https://download.zotero.org/client/release/6.0.30/Zotero-6.0.30_linux-x86_64.tar.bz2
REDIRECT_URL=$(curl -sIL -o /dev/null -w '%{url_effective}' "$ZOTERO_URL")
VERSION=$(echo "$REDIRECT_URL" | grep -oP 'Zotero-\K[0-9.]+(?=_linux)')

if [ -z "$VERSION" ]; then
    log_error "Nepodařilo se zjistit verzi Zotero z URL: $REDIRECT_URL"
    exit 1
fi

log_info "Nejnovější verze: $VERSION"

# 2. Kontrola nainstalované verze
INSTALLED_VERSION=$(dpkg-query -W -f='${Version}' "$PACKAGE_NAME" 2>/dev/null || echo "")

if [ "$INSTALLED_VERSION" == "$VERSION" ]; then
    log_success "Zotero $VERSION je již nainstalováno. Končím."
    exit 0
fi

if [ -n "$INSTALLED_VERSION" ]; then
    log_info "Nalezena starší verze: $INSTALLED_VERSION. Bude provedena aktualizace."
fi

# 3. Příprava pracovního adresáře
log_info "Vytvářím pracovní adresář: $WORK_DIR"
mkdir -p "$WORK_DIR/opt/zotero"
mkdir -p "$WORK_DIR/usr/share/applications"
mkdir -p "$WORK_DIR/usr/local/bin"
mkdir -p "$WORK_DIR/usr/local/bin"
mkdir -p "$WORK_DIR/usr/share/icons/hicolor/128x128/apps"
mkdir -p "$WORK_DIR/DEBIAN"

# 4. Stažení a rozbalení
# 4. Stažení a rozbalení
CACHE_DIR="/tmp/zotero_cache"
mkdir -p "$CACHE_DIR"
TARBALL="$CACHE_DIR/zotero-${VERSION}.tar.bz2"

if [ -f "$TARBALL" ]; then
    log_info "Používám již stažený archiv: $TARBALL"
else
    log_info "Stahuji Zotero tarball..."
    wget -q -O "$TARBALL" "$ZOTERO_URL"
fi

log_info "Rozbaluji..."
tar -xjf "$TARBALL" -C "$WORK_DIR/opt/zotero" --strip-components=1

# 5. Vytvoření DEBIAN/control
log_info "Generuji DEBIAN/control..."
cat > "$WORK_DIR/DEBIAN/control" <<EOF
Package: $PACKAGE_NAME
Version: $VERSION
Section: science
Priority: optional
Architecture: $ARCH
Maintainer: Sim <sim@localhost>
Description: Zotero is a free, easy-to-use tool to help you collect, organize, cite, and share research.
 This package is automatically generated from the official tarball.
EOF

# 6. Desktop Entry a Ikona
log_info "Konfiguruji desktop entry..."

# Použijeme desktop soubor dodávaný se Zoterem, ale upravíme cesty
DESKTOP_SRC="$WORK_DIR/opt/zotero/zotero.desktop"
DESKTOP_DST="$WORK_DIR/usr/share/applications/zotero.desktop"

if [ -f "$DESKTOP_SRC" ]; then
    cp "$DESKTOP_SRC" "$DESKTOP_DST"
    # Oprava cest v desktop souboru
    # Oprava cest v desktop souboru
    sed -i 's|^Exec=bash .*|Exec=/usr/local/bin/zotero %f|' "$DESKTOP_DST"
    
    # Najdeme ikonu
    ICON_PATH=$(find "$WORK_DIR/opt/zotero" -name "icon128.png" | head -n 1)
    if [ -z "$ICON_PATH" ]; then
        ICON_PATH=$(find "$WORK_DIR/opt/zotero" -name "*.png" | sort -r | head -n 1)
    fi
    
    if [ -n "$ICON_PATH" ]; then
        # Kopírujeme ikonu do hicolor theme
        cp "$ICON_PATH" "$WORK_DIR/usr/share/icons/hicolor/128x128/apps/zotero.png"
        sed -i "s|^Icon=.*|Icon=zotero|" "$DESKTOP_DST"
    else
        log_error "Nenalezena žádná ikona!"
    fi
    # Zajištění správných kategorií
    if ! grep -q "Categories=" "$DESKTOP_DST"; then
        echo "Categories=Office;Education;Science;" >> "$DESKTOP_DST"
    fi
else
    log_error "Nenalezen zotero.desktop v rozbaleném archivu!"
    exit 1
fi

# 7. Symlink na binárku
# V balíčku vytvoříme symlink, který se po instalaci objeví v systému
ln -s /opt/zotero/zotero "$WORK_DIR/usr/local/bin/zotero"

# 8. Nastavení oprávnění
# Vše by mělo patřit root:root
sudo chown -R root:root "$WORK_DIR"
sudo chmod -R 755 "$WORK_DIR/opt/zotero"
sudo chmod 755 "$WORK_DIR/DEBIAN/control"

# 9. Sestavení balíčku
DEB_FILENAME="zotero_${VERSION}_${ARCH}.deb"
log_info "Sestavuji .deb balíček: $DEB_FILENAME"
dpkg-deb --build "$WORK_DIR" "$DEB_FILENAME"

# 10. Instalace
log_info "Instaluji balíček..."
sudo apt install -y "./$DEB_FILENAME"

# 11. Úklid (provádí trap, ale smažeme i deb soubor pokud chceme, nebo ho necháme)
rm "./$DEB_FILENAME"

# 12. Aktualizace cache ikon
log_info "Aktualizuji cache ikon..."
if command -v update-desktop-database >/dev/null; then
    sudo update-desktop-database
fi
if command -v gtk-update-icon-cache >/dev/null; then
    sudo gtk-update-icon-cache -f -t /usr/share/icons/hicolor
fi

log_success "Zotero $VERSION bylo úspěšně nainstalováno!"
