#!/bin/bash
set -e

# ==============================================================================
# NAME:         Antigravity Installer (Reference Implementation)
# DESCRIPTION:  Installs a dummy 'antigravity' tool to demonstrate best practices.
#               Features: Smart Sudo, Colors, wrapper script, icon handling,
#               native packaging, and idempotency.
#
# AUTHOR:       Antigravity Agent
# DATE:         2025-12-06
# ==============================================================================

# --- 1. Configuration ---
APP_NAME="antigravity"
REPO_URL="https://api.github.com/repos/google/antigravity/releases/latest" # Example
FALLBACK_VERSION="1.3.0"
ICON_URL="https://raw.githubusercontent.com/google/material-design-icons/master/src/action/auto_awesome_motion/materialicons/24px.svg" # Placeholder icon
CACHE_DIR="/var/cache/$APP_NAME"

# --- 2. Styles & Helpers ---
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO] $1${NC}"; }
log_warn() { echo -e "${YELLOW}[WARN] $1${NC}"; }
log_error() { echo -e "${RED}[ERROR] $1${NC}"; }

# Function to simulate fetching the latest version from a remote source
get_latest_version() {
    # In a real script, this would be:
    # curl -s "$REPO_URL" | grep '"tag_name":' | sed -E 's/.*"([^"]+)".*/\1/'
    
    # For this demo, we simulate a "Real" version that changes or is specific
    echo "$FALLBACK_VERSION"
}

VERSION="$(get_latest_version)"
WORK_DIR="/tmp/${APP_NAME}_build"

# Smart Sudo Detection
if [ "$EUID" -eq 0 ]; then
    SUDO_CMD=""
else
    SUDO_CMD="sudo"
fi

# Cleanup Trap
cleanup() {
    if [ -d "$WORK_DIR" ]; then
        log_info "Cleaning up temporary files..."
        $SUDO_CMD rm -rf "$WORK_DIR"
    fi
}
trap cleanup EXIT INT TERM

# --- 3. Pre-flight Checks ---

# Check for required Dependencies
for cmd in curl jq; do
    if ! command -v $cmd &> /dev/null; then
        log_info "Installing missing dependency: $cmd"
        $SUDO_CMD apt update && $SUDO_CMD apt install -y $cmd
    fi
done

# Check if already installed
if dpkg -l | grep -q "^ii  $APP_NAME "; then
    INSTALLED_VERSION=$(dpkg -l | grep "^ii  $APP_NAME " | awk '{print $3}')
    if dpkg --compare-versions "$INSTALLED_VERSION" "eq" "$VERSION"; then
        log_info "$APP_NAME version $VERSION is already installed. Exiting."
        exit 0
    elif dpkg --compare-versions "$INSTALLED_VERSION" "gt" "$VERSION"; then
         log_info "$APP_NAME version $INSTALLED_VERSION is installed."
         log_info "Downgrading to $VERSION (using --allow-downgrades)..."
         APT_FLAGS="--allow-downgrades"
    else
        log_info "$APP_NAME version $INSTALLED_VERSION is installed."
        log_info "Upgrading to $VERSION..."
        APT_FLAGS=""
    fi
else
    log_info "Installing $APP_NAME version $VERSION..."
    APT_FLAGS=""
fi

# --- 4. Preparation ---

log_info "Preparing build directory..."
$SUDO_CMD rm -rf "$WORK_DIR"
mkdir -p "$WORK_DIR/usr/bin"
mkdir -p "$WORK_DIR/usr/share/applications"
mkdir -p "$WORK_DIR/usr/share/icons/hicolor/128x128/apps"
mkdir -p "$WORK_DIR/DEBIAN"

# --- 5. Content Creation (The "Antigravity" Tool) ---

log_info "Creating executable..."
# This is a wrapper script or the main binary
cat <<EOF > "$WORK_DIR/usr/bin/$APP_NAME"
#!/bin/bash
echo "🚀 Antigravity engine active! You are now flying."
echo "Version: $VERSION"
echo "Arguments: \$@"
EOF
chmod +x "$WORK_DIR/usr/bin/$APP_NAME"

log_info "Downloading icon..."
# In a real script, you might extract this from a tarball
$SUDO_CMD mkdir -p "$CACHE_DIR"
ICON_PATH="$CACHE_DIR/${APP_NAME}.jpg"
if [ ! -f "$ICON_PATH" ]; then
    curl -L -o "$ICON_PATH" "$ICON_URL"
fi
# Convert to png if needed, but for now just copy to png name for simplicity
# (Ideally we'd use imagemagick/convert, but avoiding extra deps for demo)
cp "$ICON_PATH" "$WORK_DIR/usr/share/icons/hicolor/128x128/apps/${APP_NAME}.png"

# Create Desktop Entry
log_info "Creating desktop entry..."
cat <<EOF > "$WORK_DIR/usr/share/applications/${APP_NAME}.desktop"
[Desktop Entry]
Type=Application
Name=Antigravity
Comment=Turn on anti-gravity mode
Exec=/usr/bin/$APP_NAME
Icon=$APP_NAME
Terminal=true
Categories=Utility;Amusement;
EOF

# --- 6. Packaging ---

log_info "Creating DEBIAN/control..."
INSTALLED_SIZE=$(du -s "$WORK_DIR" | cut -f1)
cat <<EOF > "$WORK_DIR/DEBIAN/control"
Package: $APP_NAME
Version: $VERSION
Section: utils
Priority: optional
Architecture: all
Maintainer: Antigravity Agent <agent@antigravity.dev>
Description: The Antigravity Tool
 This is a reference implementation of a Linux package
 installed via the antigravity methodology.
 Installed-Size: $INSTALLED_SIZE
EOF

log_info "Building .deb package..."
# Ensure root owns the files inside the package
$SUDO_CMD chown -R root:root "$WORK_DIR"
$SUDO_CMD dpkg-deb --build "$WORK_DIR" "${APP_NAME}.deb"

# --- 7. Installation ---

log_info "Installing package..."
$SUDO_CMD apt install -y $APT_FLAGS "./${APP_NAME}.deb"

# --- 8. Post-Install Triggers ---

log_info "Updating system caches..."
if command -v update-desktop-database >/dev/null; then
    $SUDO_CMD update-desktop-database
fi
if command -v gtk-update-icon-cache >/dev/null; then
    $SUDO_CMD gtk-update-icon-cache -f -t /usr/share/icons/hicolor
fi

log_info "✅ Installation complete! Run '$APP_NAME' to test."
