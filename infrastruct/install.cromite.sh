#!/bin/bash

# ==============================================================================
# NÁZEV:        Cromite Installer (Debian Package Wrapper)
# POPIS:        Stáhne oficiální release Cromite z GitHubu, zabalí ho do .deb
#               balíčku a nainstaluje pomocí apt.
#
# AUTOR:        Gemini
# DATUM:        2025-11-26
# ==============================================================================

set -e

# --- Konfigurace ---
REPO="uazo/cromite"
WORK_DIR="/tmp/cromite_build_$(date +%s)"
PACKAGE_NAME="cromite"
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

# 1. Získání verze (GitHub API)
log_info "Zjišťuji nejnovější verzi Cromite..."
LATEST_JSON=$(curl -s "https://api.github.com/repos/$REPO/releases/latest")
VERSION_TAG=$(echo "$LATEST_JSON" | grep '"tag_name":' | sed -E 's/.*"tag_name": "v?([^"]+)".*/\1/')
DOWNLOAD_URL=$(echo "$LATEST_JSON" | grep "browser_download_url" | grep "chrome-lin64.tar.gz" | cut -d '"' -f 4)

if [ -z "$VERSION_TAG" ] || [ -z "$DOWNLOAD_URL" ]; then
    log_error "Nepodařilo se zjistit verzi nebo URL ke stažení z GitHubu."
    exit 1
fi

log_info "Nejnovější verze: $VERSION_TAG"

# 2. Kontrola nainstalované verze
INSTALLED_VERSION=$(dpkg-query -W -f='${Version}' "$PACKAGE_NAME" 2>/dev/null || echo "")

if [ "$INSTALLED_VERSION" == "$VERSION_TAG" ]; then
    log_success "Cromite $VERSION_TAG je již nainstalováno. Končím."
    exit 0
fi

if [ -n "$INSTALLED_VERSION" ]; then
    log_info "Nalezena starší verze: $INSTALLED_VERSION. Bude provedena aktualizace."
fi

# 3. Příprava pracovního adresáře
log_info "Vytvářím pracovní adresář: $WORK_DIR"
mkdir -p "$WORK_DIR/opt/cromite"
mkdir -p "$WORK_DIR/usr/share/applications"
mkdir -p "$WORK_DIR/usr/local/bin"
mkdir -p "$WORK_DIR/usr/local/bin"
mkdir -p "$WORK_DIR/usr/share/icons/hicolor/256x256/apps"
mkdir -p "$WORK_DIR/DEBIAN"

# 4. Stažení a rozbalení
# 4. Stažení a rozbalení
CACHE_DIR="/tmp/cromite_cache"
mkdir -p "$CACHE_DIR"
TARBALL="$CACHE_DIR/cromite-${VERSION_TAG}.tar.gz"

if [ -f "$TARBALL" ]; then
    log_info "Používám již stažený archiv: $TARBALL"
else
    log_info "Stahuji Cromite..."
    wget -q -O "$TARBALL" "$DOWNLOAD_URL"
fi

log_info "Rozbaluji..."
# Archiv obvykle obsahuje složku 'chrome-lin64' nebo podobně, stripneme ji
tar -xzf "$TARBALL" -C "$WORK_DIR/opt/cromite" --strip-components=1

# 5. Vytvoření DEBIAN/control
log_info "Generuji DEBIAN/control..."
cat > "$WORK_DIR/DEBIAN/control" <<EOF
Package: $PACKAGE_NAME
Version: $VERSION_TAG
Section: web
Priority: optional
Architecture: $ARCH
Maintainer: Sim <sim@localhost>
Description: Cromite is a Chromium fork based on Bromite with built-in ad blocking and privacy enhancements.
 This package is automatically generated from the official GitHub release.
EOF

# 6. Desktop Entry a Ikona
log_info "Generuji desktop entry..."

# Najdeme ikonu (obvykle product_logo_*.png)
ICON_PATH=$(find "$WORK_DIR/opt/cromite" -name "product_logo_256.png" | head -n 1)
if [ -z "$ICON_PATH" ]; then
    # Fallback pokud není 256
    ICON_PATH=$(find "$WORK_DIR/opt/cromite" -name "product_logo_*.png" | sort -r | head -n 1)
fi

if [ -n "$ICON_PATH" ]; then
    cp "$ICON_PATH" "$WORK_DIR/usr/share/icons/hicolor/256x256/apps/cromite.png"
    FINAL_ICON_PATH="cromite"
else
    FINAL_ICON_PATH="web-browser" # Fallback system icon
fi

cat > "$WORK_DIR/usr/share/applications/cromite.desktop" <<EOF
[Desktop Entry]
Version=1.0
Name=Cromite
GenericName=Web Browser
Comment=Privacy-focused Chromium fork
Exec=/usr/local/bin/cromite %U
Terminal=false
Icon=$FINAL_ICON_PATH
Type=Application
Categories=Network;WebBrowser;
MimeType=text/html;text/xml;application/xhtml+xml;application/xml;application/vnd.mozilla.xul+xml;application/rss+xml;application/rdf+xml;image/gif;image/jpeg;image/png;x-scheme-handler/http;x-scheme-handler/https;
StartupNotify=true
EOF

# 7. Symlink na binárku
# Binárka se obvykle jmenuje 'chrome' nebo 'chrome_wrapper'
BINARY_NAME="chrome"
if [ -f "$WORK_DIR/opt/cromite/chrome_wrapper" ]; then
    BINARY_NAME="chrome_wrapper"
fi

ln -s "/opt/cromite/$BINARY_NAME" "$WORK_DIR/usr/local/bin/cromite"

# 8. Nastavení oprávnění
sudo chown -R root:root "$WORK_DIR"
sudo chmod -R 755 "$WORK_DIR/opt/cromite"
sudo chmod 755 "$WORK_DIR/DEBIAN/control"

# 9. Sestavení balíčku
DEB_FILENAME="cromite_${VERSION_TAG}_${ARCH}.deb"
log_info "Sestavuji .deb balíček: $DEB_FILENAME"
dpkg-deb --build "$WORK_DIR" "$DEB_FILENAME"

# 10. Instalace
log_info "Instaluji balíček..."
sudo apt install -y "./$DEB_FILENAME"

# 11. Úklid
rm "./$DEB_FILENAME"

# 12. Aktualizace cache ikon
log_info "Aktualizuji cache ikon..."
if command -v update-desktop-database >/dev/null; then
    sudo update-desktop-database
fi
if command -v gtk-update-icon-cache >/dev/null; then
    sudo gtk-update-icon-cache -f -t /usr/share/icons/hicolor
fi

log_success "Cromite $VERSION_TAG bylo úspěšně nainstalováno!"
