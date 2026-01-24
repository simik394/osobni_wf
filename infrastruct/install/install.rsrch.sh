#!/bin/bash
set -e

# Configuration
APP_NAME="rsrch"
SRC_DIR="/home/sim/Obsi/Prods/01-pwf/agents/rsrch"
WORK_DIR="/tmp/${APP_NAME}_build"
CACHE_DIR="/tmp/${APP_NAME}_cache"

# Extract version from package.json
if [ -f "$SRC_DIR/package.json" ]; then
    VERSION=$(grep -o '"version": *"[^"]*"' "$SRC_DIR/package.json" | grep -o '[0-9.]*')
else
    echo "Error: package.json not found in $SRC_DIR"
    exit 1
fi

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

log_info() {
    echo -e "${GREEN}[INFO] $1${NC}"
}

log_error() {
    echo -e "${RED}[ERROR] $1${NC}"
}

check_sudo() {
    if [ "$EUID" -ne 0 ]; then
        log_error "Please run as root (sudo)."
        exit 1
    fi
}

cleanup() {
    if [ -d "$WORK_DIR" ]; then
        log_info "Cleaning up..."
        sudo rm -rf "$WORK_DIR"
    fi
}
trap cleanup EXIT

# Check for --dev flag
DEV_MODE=false
if [ "$1" = "--dev" ]; then
    DEV_MODE=true
    log_info "Development mode enabled: Skipping .deb packaging."
fi

# 1. Preparation
check_sudo

# 2. Check installed (Skip if Dev Mode to allow overwrite easily)
if [ "$DEV_MODE" = "false" ]; then
    if dpkg -l | grep -q "^ii  $APP_NAME "; then
        INSTALLED_VERSION=$(dpkg -l | grep "^ii  $APP_NAME " | awk '{print $3}')
        if [ "$INSTALLED_VERSION" = "$VERSION" ]; then
            log_info "$APP_NAME version $VERSION is already installed. Reinstalling..."
        else
            log_info "$APP_NAME version $INSTALLED_VERSION is installed. Upgrading to $VERSION..."
        fi
    fi
fi

if [ ! -d "$SRC_DIR" ]; then
    log_error "Source directory not found: $SRC_DIR"
    exit 1
fi

if [ "$DEV_MODE" = "false" ]; then
    log_info "Preparing build directory..."
    rm -rf "$WORK_DIR"
    mkdir -p "$WORK_DIR/opt/$APP_NAME"
    mkdir -p "$WORK_DIR/usr/bin"
    mkdir -p "$WORK_DIR/DEBIAN"
    INSTALL_ROOT="$WORK_DIR"
    PROJECT_DEST="$WORK_DIR/opt/$APP_NAME"
    BIN_DEST="$WORK_DIR/usr/bin"
else
    # In dev mode, we install directly to /opt
    INSTALL_ROOT=""
    PROJECT_DEST="/opt/$APP_NAME"
    BIN_DEST="/usr/bin"
    mkdir -p "$PROJECT_DEST"
    mkdir -p "$BIN_DEST"
fi

# 3. Copy Files
log_info "Copying source files to $PROJECT_DEST..."

# Copy essential files
cp "$SRC_DIR/package.json" "$PROJECT_DEST/"
cp "$SRC_DIR/package-lock.json" "$PROJECT_DEST/" 2>/dev/null || true
cp "$SRC_DIR/docker-compose.yml" "$PROJECT_DEST/"
cp "$SRC_DIR/Dockerfile" "$PROJECT_DEST/"
cp "$SRC_DIR/tsconfig.json" "$PROJECT_DEST/"
cp -r "$SRC_DIR/src" "$PROJECT_DEST/"
cp -r "$SRC_DIR/browser" "$PROJECT_DEST/"
# Copy config.json to /opt so it can be used as a template
if [ -f "$SRC_DIR/config.json" ]; then
    cp "$SRC_DIR/config.json" "$PROJECT_DEST/"
fi

# Create data directory
mkdir -p "$PROJECT_DEST/data"
chmod 777 "$PROJECT_DEST/data" # Ensure writable by Docker

# Install dependencies (Only needed if we are building deb, 
# for dev mode we assume docker build handles it or we run npm install there?
# Actually docker build handles it. We just need source.)
if [ "$DEV_MODE" = "false" ]; then
    log_info "Installing dependencies (for packaging)..."
    cd "$PROJECT_DEST"
    npm install
    cd -
fi

# 4. Create Wrapper Script
log_info "Installing wrapper script..."
# Use the external wrapper script we created
    cp "/home/sim/Obsi/Prods/01-pwf/infrastruct/install/rsrch-wrapper.sh" "$BIN_DEST/$APP_NAME"
# Ensure it is executable
chmod +x "$BIN_DEST/$APP_NAME"


# 5. Install Man Page (Optional - create if needed)
if [ "$DEV_MODE" = "false" ]; then
    if [ -f "/home/sim/Obsi/Prods/01-pwf/infrastruct/install/rsrch.1" ]; then
        log_info "Installing man page..."
        SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
        mkdir -p "$INSTALL_ROOT/usr/share/man/man1"
        cp "$SCRIPT_DIR/rsrch.1" "$INSTALL_ROOT/usr/share/man/man1/"
        gzip "$INSTALL_ROOT/usr/share/man/man1/rsrch.1"
    fi

    # 6. Create Control File
    log_info "Creating DEBIAN/control..."
    INSTALLED_SIZE=$(du -s "$WORK_DIR" | cut -f1)
    cat <<EOF > "$WORK_DIR/DEBIAN/control"
Package: $APP_NAME
Version: $VERSION
Section: utils
Priority: optional
Architecture: all
Maintainer: Sim <sim@example.com>
Description: Research automation tool with Perplexity, NotebookLM, and Gemini (Docker-based)
 Installed-Size: $INSTALLED_SIZE
EOF

    # 7. Build .deb
    log_info "Building .deb package..."
    dpkg-deb --build "$WORK_DIR" "${APP_NAME}.deb"

    # 8. Install
    log_info "Installing package..."
    apt install -y "./${APP_NAME}.deb"

    log_info "Installation complete! Run '$APP_NAME' to see usage."
    cleanup
else
    log_info "Development install complete. Files copied to /opt/$APP_NAME."
    log_info "You may need to run '$APP_NAME build' to rebuild the Docker image."
fi
