#!/bin/bash
set -e

# Configuration
APP_NAME="perplexity-researcher"
SRC_DIR="/home/sim/Obsi/Prods/01-pwf/agents/perplexity-researcher"
WORK_DIR="/tmp/${APP_NAME}_build"
CACHE_DIR="/tmp/${APP_NAME}_cache"
VERSION="1.0.0" # Could extract from package.json

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

# 1. Preparation
check_sudo

# 2. Check if already installed with same version
if dpkg -l | grep -q "^ii  $APP_NAME "; then
    INSTALLED_VERSION=$(dpkg -l | grep "^ii  $APP_NAME " | awk '{print $3}')
    if [ "$INSTALLED_VERSION" = "$VERSION" ]; then
        log_info "$APP_NAME version $VERSION is already installed. Exiting."
        exit 0
    else
        log_info "$APP_NAME version $INSTALLED_VERSION is installed. Upgrading to $VERSION..."
    fi
fi

if [ ! -d "$SRC_DIR" ]; then
    log_error "Source directory not found: $SRC_DIR"
    exit 1
fi

log_info "Preparing build directory..."
rm -rf "$WORK_DIR"
mkdir -p "$WORK_DIR/opt/$APP_NAME"
mkdir -p "$WORK_DIR/usr/bin"
mkdir -p "$WORK_DIR/DEBIAN"

# 2. Build Project
log_info "Building project..."
cd "$SRC_DIR"

# Install dependencies and build
# We use sudo -u $SUDO_USER to build as the user, not root, to avoid permission issues in the src dir
sudo -u "$SUDO_USER" npm install
sudo -u "$SUDO_USER" npm run build

# 3. Copy Files
log_info "Copying files..."
cp package.json "$WORK_DIR/opt/$APP_NAME/"
cp -r dist "$WORK_DIR/opt/$APP_NAME/"
cp -r node_modules "$WORK_DIR/opt/$APP_NAME/"

# 4. Install Playwright Browsers (into the package)
log_info "Installing Playwright browsers..."
export PLAYWRIGHT_BROWSERS_PATH="$WORK_DIR/opt/$APP_NAME/browsers"
mkdir -p "$PLAYWRIGHT_BROWSERS_PATH"
chown -R "$SUDO_USER:$SUDO_USER" "$WORK_DIR/opt/$APP_NAME"

# Check if browsers are cached
BROWSER_CACHE="$CACHE_DIR/browsers"
if [ -d "$BROWSER_CACHE" ] && [ -n "$(ls -A $BROWSER_CACHE 2>/dev/null)" ]; then
    log_info "Using cached browsers from $BROWSER_CACHE"
    cp -r "$BROWSER_CACHE"/* "$PLAYWRIGHT_BROWSERS_PATH/"
else
    log_info "Downloading browsers (this will be cached for future runs)..."
    mkdir -p "$CACHE_DIR"
    
    cd "$SRC_DIR"
    sudo -u "$SUDO_USER" PLAYWRIGHT_BROWSERS_PATH="$WORK_DIR/opt/$APP_NAME/browsers" npx playwright install chromium
    
    # Cache the downloaded browsers
    log_info "Caching browsers for future installations..."
    mkdir -p "$BROWSER_CACHE"
    cp -r "$PLAYWRIGHT_BROWSERS_PATH"/* "$BROWSER_CACHE/"
fi

# Restore ownership to root for the package
chown -R root:root "$WORK_DIR/opt/$APP_NAME"

# 5. Create Wrapper Script
log_info "Creating wrapper script..."
cat <<EOF > "$WORK_DIR/usr/bin/$APP_NAME"
#!/bin/bash
export PLAYWRIGHT_BROWSERS_PATH="/opt/$APP_NAME/browsers"
# Do not cd to /opt, so we preserve CWD for output files
exec node /opt/$APP_NAME/dist/index.js "\$@"
EOF
chmod +x "$WORK_DIR/usr/bin/$APP_NAME"

# 6. Install Man Page
log_info "Installing man page..."
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
mkdir -p "$WORK_DIR/usr/share/man/man1"
cp "$SCRIPT_DIR/perplexity-researcher.1" "$WORK_DIR/usr/share/man/man1/"
gzip "$WORK_DIR/usr/share/man/man1/perplexity-researcher.1"

# 7. Create Control File
log_info "Creating DEBIAN/control..."
INSTALLED_SIZE=$(du -s "$WORK_DIR" | cut -f1)
cat <<EOF > "$WORK_DIR/DEBIAN/control"
Package: $APP_NAME
Version: $VERSION
Section: utils
Priority: optional
Architecture: all
Maintainer: Sim <sim@example.com>
Description: Perplexity AI automation tool
 Installed-Size: $INSTALLED_SIZE
EOF

# 8. Build .deb
log_info "Building .deb package..."
dpkg-deb --build "$WORK_DIR" "${APP_NAME}.deb"

# 9. Install
log_info "Installing package..."
apt install -y "./${APP_NAME}.deb"

log_info "Installation complete! Run '$APP_NAME' to start."
