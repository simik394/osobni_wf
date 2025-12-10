#!/bin/bash
set -e


# Proměnné
WORK_DIR="/tmp/nvim_packaging"
PACKAGE_NAME="neovim-custom"
ARCH="amd64"
DEB_FILE="${WORK_DIR}.deb"

# 1. Příprava prostředí
echo "--- Čistím pracovní adresář ---"
rm -rf "$WORK_DIR"
mkdir -p "$WORK_DIR/usr"
mkdir -p "$WORK_DIR/DEBIAN"

# 2. Stažení nejnovější verze (tarball)
echo "--- Stahuji nejnovější Neovim ---"
cd /tmp
# Stahujeme rovnou, nepředpokládám, že máš curl, wget je jistota
wget -O nvim.tar.gz https://github.com/neovim/neovim/releases/latest/download/nvim-linux-x86_64.tar.gz

if [ ! -s nvim.tar.gz ]; then
    echo "CHYBA: Stažený soubor je prázdný. Zkontrolujte připojení k internetu."
    exit 1
fi

# 3. Rozbalení obsahu do struktury balíčku
echo "--- Rozbaluji a připravuji strukturu ---"
tar -xzf nvim.tar.gz

if [ ! -d "nvim-linux-x86_64" ]; then
    echo "CHYBA: Adresář nvim-linux-x86_64 nebyl nalezen po rozbalení."
    exit 1
fi

# Přesuneme obsah nvim-linux-x86_64/* (bin, lib, share) do usr/ složky balíčku
cp -r nvim-linux-x86_64/* "$WORK_DIR/usr/"

# Získání verze pro metadata (spustíme staženou binárku)
VERSION=$("$WORK_DIR/usr/bin/nvim" --version | head -n 1 | awk '{print $2}' | sed 's/v//')
echo "--- Detekována verze: $VERSION ---"

# 4. Vytvoření control souboru (metadata pro APT)
echo "--- Generuji DEBIAN/control ---"
cat > "$WORK_DIR/DEBIAN/control" <<EOF
Package: $PACKAGE_NAME
Version: $VERSION
Section: editors
Priority: optional
Architecture: $ARCH
Maintainer: Sim <sim@localhost>
Description: Custom build of latest Neovim
 Installing latest Neovim from GitHub release as a deb package.
EOF

# 5. Sestavení .deb balíčku
echo "--- Balím .deb soubor ---"
dpkg-deb --build "$WORK_DIR" "$DEB_FILE"

# 6. Instalace přes APT
echo "--- Instaluji pomocí apt ---"
# Odstraníme případnou kolizi s oficiálním balíčkem
sudo apt remove -y neovim neovim-runtime 2>/dev/null || true

# Instalace našeho .deb
sudo apt install -y "$DEB_FILE"

# 7. Úklid
echo "--- Úklid ---"
rm -rf "$WORK_DIR" /tmp/nvim-linux64 /tmp/nvim.tar.gz "$DEB_FILE"

echo "--- Hotovo. Neovim $VERSION je nainstalován a spravován přes apt. ---"
nvim --version | head -n 1
