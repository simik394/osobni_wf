#!/bin/bash
#
# Vial Installer (Docker Build + Deb Package)
#
# Usage:
#   ./install.vial.sh
#
# Description:
#   Builds Vial-GUI from source using a Docker container (Python 3.6)
#   to support custom keyboard layouts (specifically Czech Programmer).
#   Packages the result as a .deb and installs it.
#

set -e

# --- Configuration ---
REPO_URL="https://github.com/vial-kb/vial-gui"
WORK_DIR="/tmp/vial_build_$(date +%s)"
IMAGE_NAME="vial-builder"
CONTAINER_NAME="vial-build-container"

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
    fi
}

check_docker() {
    if ! command -v docker >/dev/null; then
        log_error "Docker is not installed. Please install Docker to use this script."
        exit 1
    fi
}

cleanup() {
    log_info "Cleaning up..."
    sudo rm -rf "$WORK_DIR"
    # Optional: Remove docker image? Maybe keep it for cache.
    # docker rmi "$IMAGE_NAME" || true
}

# --- Main ---

# Ensure cleanup happens on exit, even if error occurs
trap cleanup EXIT

check_sudo
check_docker

log_info "Creating build directory: $WORK_DIR"
mkdir -p "$WORK_DIR"
cd "$WORK_DIR"

# 1. Create Patch Script
cat > apply_czech_layout.py <<EOF
import os

KEYCODES_PATH = 'src/main/python/keycodes/keycodes.py'

# Mapping for Czech Programmer (approximate based on standard Czech row)
# Standard US: 1 2 3 4 5 6 7 8 9 0
# Czech:       + ě š č ř ž ý á í é
# Vial Label Format: "Shift\nBase" or just "Label"
# We want to replace the label argument in K("KC_X", "Label", ...)

replacements = {
    'K("KC_1", "!\\n1"': 'K("KC_1", "1\\n+"',
    'K("KC_2", "@\\n2"': 'K("KC_2", "2\\ně"',
    'K("KC_3", "#\\n3"': 'K("KC_3", "3\\nš"',
    'K("KC_4", "$\\n4"': 'K("KC_4", "4\\nč"',
    'K("KC_5", "%\\n5"': 'K("KC_5", "5\\nř"',
    'K("KC_6", "^\\n6"': 'K("KC_6", "6\\nž"',
    'K("KC_7", "&\\n7"': 'K("KC_7", "7\\ný"',
    'K("KC_8", "*\\n8"': 'K("KC_8", "8\\ná"',
    'K("KC_9", "(\\n9"': 'K("KC_9", "9\\ní"',
    'K("KC_0", ")\\n0"': 'K("KC_0", "0\\né"',
}

if not os.path.exists(KEYCODES_PATH):
    print(f"Error: {KEYCODES_PATH} not found!")
    exit(1)

with open(KEYCODES_PATH, 'r', encoding='utf-8') as f:
    content = f.read()

for old, new in replacements.items():
    if old in content:
        print(f"Patching: {old} -> {new}")
        content = content.replace(old, new)
    else:
        print(f"Warning: Could not find string to patch: {old}")

with open(KEYCODES_PATH, 'w', encoding='utf-8') as f:
    f.write(content)

print("Patch applied successfully.")
EOF

# 2. Create Dockerfile
cat > Dockerfile <<EOF
FROM python:3.6-buster

# Fix for archived Debian Buster repositories
RUN echo "deb http://archive.debian.org/debian buster main" > /etc/apt/sources.list && \\
    echo "deb http://archive.debian.org/debian-security buster/updates main" >> /etc/apt/sources.list && \\
    echo "deb http://archive.debian.org/debian buster-updates main" >> /etc/apt/sources.list && \\
    apt-get -o Acquire::Check-Valid-Until=false update

# Install system dependencies
# fbs requires some libraries, and we need git
RUN apt-get install -y \\
    git \\
    build-essential \\
    libgl1-mesa-glx \\
    libxkbcommon-x11-0 \\
    libusb-1.0-0-dev \\
    libudev-dev \\
    ruby \\
    ruby-dev \\
    rubygems \\
    && rm -rf /var/lib/apt/lists/*

# Install fpm for deb packaging (fbs might use it or we might need it)
RUN gem install fpm

WORKDIR /usr/src/app

# Clone Repo
RUN git clone --depth 1 $REPO_URL .

# Install Python Requirements
# We need to install requirements.txt. 
# Note: Some requirements might be old/broken on newer systems, but 3.6-buster should be okay.
RUN pip install --upgrade pip
RUN pip install -r requirements.txt

# Copy Patch Script
COPY apply_czech_layout.py .

# Apply Patch
RUN python3 apply_czech_layout.py

# Build
# fbs freeze creates the executable
RUN fbs freeze

# Debug: List target directory to confirm app name
RUN ls -R target

# --- Stage 2: Packaging ---
FROM ruby:2.7

# Install fpm
RUN gem install fpm

WORKDIR /package

# Copy build artifacts from builder stage
COPY --from=0 /usr/src/app/target/Vial /package/opt/vial

# Package with fpm
RUN fpm -s dir -t deb \\
    -n vial-gui \\
    -v 0.1.0 \\
    --architecture amd64 \\
    --maintainer "Sim <sim@localhost>" \\
    --description "Vial QMK GUI (Custom Czech Layout)" \\
    --prefix /opt/vial \\
    -C /package/opt/vial \\
    .

# Move the deb to a known location for extraction
RUN mkdir -p /output && mv *.deb /output/
EOF

# 3. Build Docker Image
log_info "Building Docker image (this may take a while)..."
sudo docker build -t "$IMAGE_NAME" .

# 4. Extract Artifacts
log_info "Extracting build artifacts..."
# Create a dummy container to copy files from
sudo docker create --name "$CONTAINER_NAME" "$IMAGE_NAME"

# Copy the target directory which contains the .deb
sudo docker cp "$CONTAINER_NAME":/output/ .

# Remove the dummy container
sudo docker rm "$CONTAINER_NAME"

# 5. Install .deb
log_info "Installing .deb package..."
DEB_FILE=$(find output -name "*.deb" | head -n 1)

if [ -z "$DEB_FILE" ]; then
    log_error "No .deb file found in output directory!"
    ls -R output
    exit 1
fi

log_info "Found package: $DEB_FILE"
sudo apt-get install -y "./$DEB_FILE"

# 6. Udev Rules
log_info "Ensuring udev rules..."
# The .deb might have installed them, but let's double check/enforce standard Vial rules
RULES_FILE="/etc/udev/rules.d/99-vial.rules"
if [ ! -f "$RULES_FILE" ]; then
    log_info "Creating $RULES_FILE..."
    echo 'KERNEL=="hidraw*", SUBSYSTEM=="hidraw", ATTRS{serial}=="*vial:f64c2b3c*", MODE="0660", GROUP="users", TAG+="uaccess", TAG+="udev-acl"' | sudo tee "$RULES_FILE"
    sudo udevadm control --reload && sudo udevadm trigger
else
    log_info "Udev rules already exist."
fi

# 7. Post-Install (Symlink & Desktop Entry)
log_info "Configuring shortcuts..."
if [ ! -f "/usr/local/bin/vial" ]; then
    log_info "Creating symlink /usr/local/bin/vial..."
    sudo ln -s /opt/vial/Vial /usr/local/bin/vial
fi

DESKTOP_FILE="/usr/share/applications/vial.desktop"
if [ ! -f "$DESKTOP_FILE" ]; then
    log_info "Creating desktop entry..."
    cat <<EOF | sudo tee "$DESKTOP_FILE"
[Desktop Entry]
Name=Vial
Comment=Vial QMK GUI
Exec=/opt/vial/Vial
Icon=/opt/vial/Icon.ico
Terminal=false
Type=Application
Categories=Utility;
EOF
fi



log_success "Vial installed successfully!"
