#!/bin/bash

# ==============================================================================
# NÁZEV:        Tmux Installer (Source Build & Debian Package)
# POPIS:        Stáhne nejnovější zdrojový kód Tmux, zkompiluje ho,
#               zabalí do .deb balíčku a nainstaluje.
#
# AUTOR:        Gemini
# DATUM:        2025-11-26
# ==============================================================================

set -e

# --- Konfigurace ---
REPO="tmux/tmux"
WORK_DIR="/tmp/tmux_build_$(date +%s)"
PACKAGE_NAME="tmux-custom" # Abychom se neprali s oficiálním balíčkem 'tmux'
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
        log_info "Tento skript vyžaduje oprávnění root pro instalaci závislostí a balíčku."
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
log_info "Zjišťuji nejnovější verzi Tmux..."
LATEST_JSON=$(curl -s "https://api.github.com/repos/$REPO/releases/latest")
VERSION_TAG=$(echo "$LATEST_JSON" | grep '"tag_name":' | sed -E 's/.*"tag_name": "v?([^"]+)".*/\1/')
# Tmux releases jsou obvykle tmux-X.Y.tar.gz
DOWNLOAD_URL=$(echo "$LATEST_JSON" | grep "browser_download_url" | grep ".tar.gz" | head -n 1 | cut -d '"' -f 4)

if [ -z "$VERSION_TAG" ] || [ -z "$DOWNLOAD_URL" ]; then
    log_error "Nepodařilo se zjistit verzi nebo URL ke stažení z GitHubu."
    exit 1
fi

log_info "Nejnovější verze: $VERSION_TAG"

# 2. Kontrola nainstalované verze
INSTALLED_VERSION=$(dpkg-query -W -f='${Version}' "$PACKAGE_NAME" 2>/dev/null || echo "")

if [ "$INSTALLED_VERSION" == "$VERSION_TAG" ]; then
    log_success "Tmux $VERSION_TAG je již nainstalován (jako $PACKAGE_NAME). Končím."
    exit 0
fi

if [ -n "$INSTALLED_VERSION" ]; then
    log_info "Nalezena starší verze: $INSTALLED_VERSION. Bude provedena aktualizace."
fi

# 3. Instalace závislostí pro sestavení
log_info "Instaluji závislosti pro sestavení..."
sudo apt update
sudo apt install -y libevent-dev libncurses5-dev bison pkg-config automake build-essential

# 4. Příprava pracovního adresáře
log_info "Vytvářím pracovní adresář: $WORK_DIR"
mkdir -p "$WORK_DIR/src"
mkdir -p "$WORK_DIR/pkg/usr/local/bin"
mkdir -p "$WORK_DIR/pkg/usr/share/man/man1"
mkdir -p "$WORK_DIR/pkg/DEBIAN"

# 5. Stažení a rozbalení
CACHE_DIR="/tmp/tmux_cache"
mkdir -p "$CACHE_DIR"
TARBALL="$CACHE_DIR/tmux-${VERSION_TAG}.tar.gz"

if [ -f "$TARBALL" ]; then
    log_info "Používám již stažený archiv: $TARBALL"
else
    log_info "Stahuji Tmux..."
    wget -q -O "$TARBALL" "$DOWNLOAD_URL"
fi

log_info "Rozbaluji..."
tar -xzf "$TARBALL" -C "$WORK_DIR/src" --strip-components=1

# 6. Kompilace
log_info "Kompiluji Tmux (to může chvíli trvat)..."
cd "$WORK_DIR/src"
./configure --prefix=/usr/local
make -j$(nproc)

# 7. Instalace do dočasného adresáře (staging)
log_info "Instaluji do balíčku..."
make install DESTDIR="$WORK_DIR/pkg"

# 8. Vytvoření DEBIAN/control
log_info "Generuji DEBIAN/control..."
cat > "$WORK_DIR/pkg/DEBIAN/control" <<EOF
Package: $PACKAGE_NAME
Version: $VERSION_TAG
Section: utils
Priority: optional
Architecture: $ARCH
Conflicts: tmux
Replaces: tmux
Provides: tmux
Maintainer: Sim <sim@localhost>
Description: Terminal multiplexer
 tmux is a terminal multiplexer: it enables a number of terminals to be
 created, accessed, and controlled from a single screen. tmux may be
 detached from a screen and continue running in the background, then
 later reattached.
 .
 This package is compiled from the official source release.
EOF

# 9. Nastavení oprávnění
sudo chown -R root:root "$WORK_DIR/pkg"
sudo chmod -R 755 "$WORK_DIR/pkg/usr"
sudo chmod 755 "$WORK_DIR/pkg/DEBIAN/control"

# 10. Sestavení balíčku
DEB_FILENAME="tmux_${VERSION_TAG}_${ARCH}.deb"
log_info "Sestavuji .deb balíček: $DEB_FILENAME"
# Musíme být o úroveň výš nebo specifikovat cestu
dpkg-deb --build "$WORK_DIR/pkg" "$DEB_FILENAME"

# 11. Instalace
log_info "Instaluji balíček..."
# Odstraníme systémový tmux, pokud existuje a není to náš balíček
if dpkg -l | grep -q "^ii  tmux "; then
    log_info "Odstraňuji systémový balíček tmux (pro náhradu za custom verzi)..."
    sudo apt remove -y tmux
fi

sudo apt install -y "./$DEB_FILENAME"

# 12. Úklid
rm "./$DEB_FILENAME"

log_success "Tmux $VERSION_TAG byl úspěšně nainstalován!"
tmux -V
