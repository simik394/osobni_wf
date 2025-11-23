#!/bin/bash
#
# Alacritty Installer (Debian Package)
#
# Usage:
#   ./install.alacritty.sh [--local | --docker]
#
# Options:
#   --local         Force local build (requires cargo, cmake, etc.)
#   --docker        Force Docker build (requires docker)
#   (none)          Smart detect: uses local if deps exist, else docker.
#
# Description:
#   Builds Alacritty and packages it as a .deb file for clean installation.

set -e

# --- Configuration ---
REPO_URL="https://github.com/alacritty/alacritty"
WORK_DIR="/tmp/alacritty_pkg"
BUILD_DIR="/tmp/alacritty_build"
PKG_NAME="alacritty-custom"
ARCH=$(dpkg --print-architecture)
VERSION="0.0.0" # Will be detected

# --- Helper Functions ---

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
        log_info "This script requires root privileges for installation steps."
        sudo -v
        SUDO="sudo"
    else
        SUDO=""
    fi
}

check_local_deps() {
    # Check for cargo and build dependencies
    local missing=0
    command -v cargo >/dev/null || missing=1
    command -v cmake >/dev/null || missing=1
    command -v pkg-config >/dev/null || missing=1
    # We can't easily check for libraries via command -v, but if pkg-config is missing, we assume deps are missing.
    # A more robust check would be `dpkg -s libfreetype6-dev` etc, but let's keep it simple:
    # If cargo is missing, we definitely can't build locally without installing it.
    
    if [ $missing -eq 0 ]; then
        return 0 # All good
    else
        return 1 # Missing deps
    fi
}

prepare_staging() {
    log_info "Preparing staging directory..."
    rm -rf "$WORK_DIR"
    mkdir -p "$WORK_DIR/usr/bin"
    mkdir -p "$WORK_DIR/usr/share/applications"
    mkdir -p "$WORK_DIR/usr/share/icons/hicolor/scalable/apps"
    mkdir -p "$WORK_DIR/usr/share/man/man1"
    mkdir -p "$WORK_DIR/usr/share/man/man5"
    mkdir -p "$WORK_DIR/usr/share/zsh/vendor-completions"
    mkdir -p "$WORK_DIR/usr/share/terminfo"
    mkdir -p "$WORK_DIR/DEBIAN"
}

install_assets_to_staging() {
    log_info "Installing assets to staging..."
    
    # Clone repo to temp dir if not already there (for assets)
    if [ ! -d "$BUILD_DIR/alacritty" ]; then
        log_info "Cloning Alacritty repository for assets..."
        mkdir -p "$BUILD_DIR"
        git clone --depth 1 "$REPO_URL" "$BUILD_DIR/alacritty"
    fi
    
    cd "$BUILD_DIR/alacritty"

    # 1. Terminfo
    log_info "Compiling terminfo..."
    if command -v tic >/dev/null; then
        tic -xe alacritty,alacritty-direct -o "$WORK_DIR/usr/share/terminfo" extra/alacritty.info
    else
        log_error "tic command not found. Please install ncurses-bin."
        exit 1
    fi

    # 2. Desktop file
    cp extra/linux/Alacritty.desktop "$WORK_DIR/usr/share/applications/"

    # 3. Icon
    cp extra/logo/alacritty-term.svg "$WORK_DIR/usr/share/icons/hicolor/scalable/apps/Alacritty.svg"

    # 4. Man pages
    gzip -c extra/man/alacritty.1.scd > "$WORK_DIR/usr/share/man/man1/alacritty.1.gz"
    gzip -c extra/man/alacritty-msg.1.scd > "$WORK_DIR/usr/share/man/man1/alacritty-msg.1.gz"
    gzip -c extra/man/alacritty.5.scd > "$WORK_DIR/usr/share/man/man5/alacritty.5.gz"

    # 5. Completions (Zsh)
    cp extra/completions/_alacritty "$WORK_DIR/usr/share/zsh/vendor-completions/"
}

build_local() {
    log_info "Starting LOCAL build..."
    
    # We assume deps are present or user forced local build.
    # If forced and missing, we try to install them? 
    # The plan said "If ALL present -> Default to Local". 
    # If user forces local, we should probably ensure deps.
    
    log_info "Ensuring build dependencies..."
    $SUDO apt-get update
    $SUDO apt-get install -y cmake pkg-config libfreetype6-dev libfontconfig1-dev \
        libxcb-xfixes0-dev libxkbcommon-dev python3 gzip curl git ncurses-bin

    if ! command -v cargo >/dev/null; then
        log_info "Cargo not found. Installing Rust via rustup..."
        curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
        source "$HOME/.cargo/env"
    fi

    log_info "Building Alacritty via cargo..."
    # We use cargo install to a temp root to easily get the binary
    cargo install alacritty --root "$BUILD_DIR/install_root"

    BINARY="$BUILD_DIR/install_root/bin/alacritty"
    if [ -f "$BINARY" ]; then
        cp "$BINARY" "$WORK_DIR/usr/bin/alacritty"
        # Get version
        VERSION=$("$BINARY" --version | awk '{print $2}')
    else
        log_error "Build failed."
        exit 1
    fi
}

build_docker() {
    log_info "Starting DOCKER build..."
    
    if ! command -v docker >/dev/null; then
        log_error "Docker is not installed."
        exit 1
    fi

    # Need git for cloning
    $SUDO apt-get install -y git gzip ncurses-bin

    mkdir -p "$BUILD_DIR"
    if [ -d "$BUILD_DIR/alacritty" ]; then
        rm -rf "$BUILD_DIR/alacritty"
    fi
    
    log_info "Cloning repository..."
    git clone "$REPO_URL" "$BUILD_DIR/alacritty"
    cd "$BUILD_DIR/alacritty"

    log_info "Running cargo build in Docker..."
    $SUDO docker run --rm \
        -v "$(pwd):/usr/src/alacritty" \
        -w "/usr/src/alacritty" \
        rust:latest \
        cargo build --release

    BINARY="target/release/alacritty"
    if [ -f "$BINARY" ]; then
        cp "$BINARY" "$WORK_DIR/usr/bin/alacritty"
        # Get version (need to run it, but it's compiled for linux so should run if arch matches)
        # Or parse Cargo.toml. Let's try running it.
        VERSION=$("./$BINARY" --version | awk '{print $2}')
    else
        log_error "Docker build failed."
        exit 1
    fi
}

create_deb() {
    log_info "Creating DEBIAN/control..."
    
    cat > "$WORK_DIR/DEBIAN/control" <<EOF
Package: $PKG_NAME
Version: $VERSION
Section: utils
Priority: optional
Architecture: $ARCH
Maintainer: Sim <sim@localhost>
Description: GPU-accelerated terminal emulator
 Alacritty is a terminal emulator with a strong focus on simplicity and performance.
EOF

    log_info "Building .deb package..."
    dpkg-deb --build "$WORK_DIR" "${PKG_NAME}_${VERSION}_${ARCH}.deb"
    DEB_FILE="${PKG_NAME}_${VERSION}_${ARCH}.deb"
}

install_deb() {
    log_info "Installing .deb package..."
    
    # Remove conflicting alternatives if any (cleanup from previous manual install)
    if update-alternatives --query x-terminal-emulator 2>/dev/null | grep -q "$INSTALL_DIR/$BIN_NAME"; then
         $SUDO update-alternatives --remove x-terminal-emulator /usr/local/bin/alacritty 2>/dev/null || true
    fi

    $SUDO apt install -y "./$DEB_FILE"
    
    # Register alternative (apt install might not do it automatically for custom pkg unless postinst script exists)
    # Let's add a postinst script or just do it here. Doing it here is easier.
    $SUDO update-alternatives --install /usr/bin/x-terminal-emulator x-terminal-emulator /usr/bin/alacritty 50
}

# --- Main ---

MODE="auto"

while [[ "$#" -gt 0 ]]; do
    case $1 in
        --local) MODE="local" ;;
        --docker) MODE="docker" ;;
        *) echo "Unknown parameter: $1"; exit 1 ;;
    esac
    shift
done

check_sudo
prepare_staging

if [ "$MODE" == "auto" ]; then
    if check_local_deps; then
        log_info "Dependencies found. Using LOCAL build."
        MODE="local"
    else
        log_info "Dependencies missing. Using DOCKER build."
        MODE="docker"
    fi
fi

if [ "$MODE" == "local" ]; then
    build_local
else
    build_docker
fi

install_assets_to_staging
create_deb
install_deb

# Cleanup
log_info "Cleaning up..."
$SUDO rm -rf "$WORK_DIR" "$BUILD_DIR"

log_success "Alacritty installed successfully via .deb!"
alacritty --version
