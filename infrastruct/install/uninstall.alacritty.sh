#!/bin/bash
#
# Alacritty Uninstaller
#
# Description:
#   Removes Alacritty binary and all assets installed by install.alacritty.sh.

set -e

log_info() {
    echo -e "\033[1;34m[INFO]\033[0m $1"
}

log_success() {
    echo -e "\033[1;32m[OK]\033[0m $1"
}

check_sudo() {
    if [ "$EUID" -ne 0 ]; then
        log_info "Root privileges required for uninstallation."
        sudo -v
        SUDO="sudo"
    else
        SUDO=""
    fi
}

check_sudo

log_info "Removing Alacritty binary..."
$SUDO rm -f /usr/local/bin/alacritty

log_info "Removing desktop file..."
$SUDO rm -f /usr/share/applications/Alacritty.desktop
$SUDO update-desktop-database

log_info "Removing icon..."
$SUDO rm -f /usr/share/icons/hicolor/scalable/apps/Alacritty.svg

log_info "Removing man pages..."
$SUDO rm -f /usr/local/share/man/man1/alacritty.1.gz
$SUDO rm -f /usr/local/share/man/man1/alacritty-msg.1.gz
$SUDO rm -f /usr/local/share/man/man5/alacritty.5.gz

log_info "Removing Zsh completions..."
$SUDO rm -f /usr/share/zsh/vendor-completions/_alacritty

log_info "Removing terminfo entries..."
# Only remove if they exist to avoid errors
if [ -d "/usr/share/terminfo/a" ]; then
    $SUDO rm -f /usr/share/terminfo/a/alacritty*
fi

log_info "Removing from update-alternatives..."
# Ignore error if it's not there
$SUDO update-alternatives --remove x-terminal-emulator /usr/local/bin/alacritty 2>/dev/null || true

log_success "Alacritty uninstallation complete."
