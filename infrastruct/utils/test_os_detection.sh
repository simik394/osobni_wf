#!/bin/bash
log_info() { echo "[INFO] $1"; }

if [ -f /etc/os-release ]; then
    . /etc/os-release
else
    log_info "Cannot detect OS. Defaulting to debian/bookworm."
    ID=debian
    VERSION_CODENAME=bookworm
fi

TARGET_DISTRO="$ID"
TARGET_CODENAME="$VERSION_CODENAME"

if [[ "$ID" == "pop" || "$ID" == "linuxmint" || "$ID" == "elementary" ]]; then
    TARGET_DISTRO="ubuntu"
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

if [ -z "$TARGET_CODENAME" ]; then
    TARGET_CODENAME=$(lsb_release -cs)
fi

echo "Detected: ID=$ID, VERSION_CODENAME=$VERSION_CODENAME"
echo "Mapped: TARGET_DISTRO=$TARGET_DISTRO, TARGET_CODENAME=$TARGET_CODENAME"
