#!/bin/bash
#
# Docker Installer
#
# Description:
#   Installs Docker Engine, CLI, containerd, and Docker Compose plugin
#   from the official Docker repository.
#   Also adds the current user to the 'docker' group.

set -e

# --- Helper Functions ---

log_info() {
    echo -e "\033[1;34m[INFO]\033[0m $1"
}

log_success() {
    echo -e "\033[1;32m[OK]\033[0m $1"
}

check_sudo() {
    if [ "$EUID" -ne 0 ]; then
        log_info "This script requires root privileges."
        sudo -v
        SUDO="sudo"
    else
        SUDO=""
    fi
}

# --- Main ---

check_sudo

# --- OS Detection ---

log_info "Detecting OS..."
# Detect distro and map to Docker-supported upstream
if [ -f /etc/os-release ]; then
    . /etc/os-release
else
    log_info "Cannot detect OS. Defaulting to debian/bookworm."
    ID=debian
    VERSION_CODENAME=bookworm
fi

# Map derivatives to upstream
# Docker provides repos for: debian, ubuntu, fedora, centos, rhel, sles
TARGET_DISTRO="$ID"
TARGET_CODENAME="$VERSION_CODENAME"

# Handle known derivatives or use ID_LIKE
if [[ "$ID" == "pop" || "$ID" == "linuxmint" || "$ID" == "elementary" ]]; then
    TARGET_DISTRO="ubuntu"
    # Pop!_OS and others usually set UBUNTU_CODENAME
    if [ -n "$UBUNTU_CODENAME" ]; then
        TARGET_CODENAME="$UBUNTU_CODENAME"
    fi
elif [[ "$ID_LIKE" == *"ubuntu"* ]]; then
    TARGET_DISTRO="ubuntu"
    if [ -n "$UBUNTU_CODENAME" ]; then
        TARGET_CODENAME="$UBUNTU_CODENAME"
    fi
elif [[ "$ID_LIKE" == *"debian"* ]]; then
    TARGET_DISTRO="debian"
fi

# Final safety check for empty codename
if [ -z "$TARGET_CODENAME" ]; then
    TARGET_CODENAME=$(lsb_release -cs)
fi

log_info "Detected OS: $ID, mapping to Docker repo: $TARGET_DISTRO ($TARGET_CODENAME)"

# --- Installation ---

log_info "Removing conflicting packages..."
for pkg in docker.io docker-doc docker-compose podman-docker containerd runc; do
    $SUDO apt-get remove -y $pkg 2>/dev/null || true
done

log_info "Updating apt and installing prerequisites..."
$SUDO apt-get update
$SUDO apt-get install -y ca-certificates curl gnupg

log_info "Adding Docker's official GPG key..."
$SUDO install -m 0755 -d /etc/apt/keyrings
# Overwrite if exists to ensure it's fresh
# Use the mapped distro for the GPG key URL
curl -fsSL "https://download.docker.com/linux/$TARGET_DISTRO/gpg" | $SUDO gpg --dearmor -o /etc/apt/keyrings/docker.gpg --yes
$SUDO chmod a+r /etc/apt/keyrings/docker.gpg

log_info "Adding Docker repository..."
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/$TARGET_DISTRO \
  $TARGET_CODENAME stable" | \
  $SUDO tee /etc/apt/sources.list.d/docker.list > /dev/null

log_info "Installing Docker Engine..."
$SUDO apt-get update
$SUDO apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

log_info "Adding user '$USER' to 'docker' group..."
if ! getent group docker >/dev/null; then
    $SUDO groupadd docker
fi
$SUDO usermod -aG docker "$USER"

log_info "Setting up 'docker-compose' compatibility..."
# Create a wrapper script for docker-compose if it doesn't exist
if ! command -v docker-compose >/dev/null 2>&1; then
    echo '#!/bin/bash' | $SUDO tee /usr/local/bin/docker-compose >/dev/null
    echo 'exec docker compose "$@"' | $SUDO tee -a /usr/local/bin/docker-compose >/dev/null
    $SUDO chmod +x /usr/local/bin/docker-compose
    log_success "Created 'docker-compose' wrapper script pointing to 'docker compose'."
else
    log_info "'docker-compose' command already exists."
fi

log_success "Docker installed successfully!"
log_info "You may need to log out and back in for group changes to take effect."
docker --version
if command -v docker-compose >/dev/null 2>&1; then
    docker-compose --version
fi
