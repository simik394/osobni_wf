# Installation Script Best Practices & Methodology

This document outlines the rules, experiences, and methods established for creating robust installation scripts in this project. These practices ensure consistency, system stability, and a clean user experience on Pop!_OS (and Debian-based systems).

## 1. Core Philosophy

*   **Native Packaging**: Do not just extract tarballs to `/opt`. Always wrap them in a temporary `.deb` package. This allows the system package manager (`apt`) to track files, manage updates, and perform clean uninstalls.
*   **Idempotency**: Scripts must be runnable multiple times without side effects. Always check if the target version is already installed before proceeding.
*   **User Experience**: The installation should be silent (except for sudo prompts) and the application must appear in the system menu immediately with the correct icon.
*   **Visual Feedback**: Use colored output (Green for success/info, Red for errors) to make logs readable.
*   **Wrapper Scripts**: For Docker apps, AppImages, or complex environments, create a wrapper script in `/usr/bin/` to handle startup logic.

## 2. Key Rules & Methods

### A. Visual Feedback & Logging
Define standard logging functions early in the script:
```bash
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

log_info() { echo -e "${GREEN}[INFO] $1${NC}"; }
log_error() { echo -e "${RED}[ERROR] $1${NC}"; }
```

### B. Smart Sudo Handling
Don't hardcode `sudo` inside every command. Detect if running as root, or define a `SUDO_CMD` variable.
```bash
if [ "$EUID" -eq 0 ]; then
    SUDO_CMD=""
else
    SUDO_CMD="sudo"
fi
# Usage: $SUDO_CMD apt install ...
```

### C. Icon Handling (Critical)
Experience has shown that non-standard icon paths (like `/opt/app/icon.png`) are fragile.
*   **Rule**: Always install icons to the **Hicolor Icon Theme** structure.
*   **Path**: `/usr/share/icons/hicolor/<resolution>/apps/<app_name>.png` (e.g., `128x128`, `256x256`, or `scalable`).
*   **Desktop File**: Set `Icon=<app_name>` (no path, no extension).
*   **Cache Update**: You **MUST** run the following commands at the end of the script to force the menu to update immediately:
    ```bash
    # Update desktop database
    if command -v update-desktop-database >/dev/null; then
        $SUDO_CMD update-desktop-database
    fi
    # Update icon cache
    if command -v gtk-update-icon-cache >/dev/null; then
        $SUDO_CMD gtk-update-icon-cache -f -t /usr/share/icons/hicolor
    fi
    ```

### D. Permissions & Sudo
*   **Building**: The package build directory (`WORK_DIR`) should be owned by `root:root` before building the `.deb`.
*   **Cleanup**: When using `trap cleanup EXIT`, ensure `rm -rf "$WORK_DIR"` is run with `sudo` if the directory contains root-owned files (which it will after `chown`).
    ```bash
    ```bash
    cleanup() {
        if [ -d "$WORK_DIR" ]; then
            $SUDO_CMD rm -rf "$WORK_DIR"
        fi
    }
    trap cleanup EXIT INT TERM
    ```

### E. Download Caching
To speed up re-runs and testing, implement a local cache.
*   **Location**: `/tmp/<app>_cache`
*   **Logic**: Check if the file exists in the cache before downloading.

### F. Version Detection
*   **Remote Check**: Always try to fetch the latest version string dynamically (e.g., via GitHub API or `curl -I` location headers) to ensure the script doesn't become obsolete.

## 3. Standard Script Structure

```bash
#!/bin/bash
set -e

# Configuration
APP_NAME="myapp"
WORK_DIR="/tmp/build_..."

# ... Helper Functions (log_info, check_sudo, cleanup) ...

# 1. Detect Version & Check Installed
# 2. Prepare Workflow (SUDO_CMD, WORK_DIR)
# 3. Download (with Cache) & Extract
# 4. Create Wrapper Script (if needed)
#    - Handle Docker Compose, Envs, or Arguments
# 5. Create DEBIAN/control
# 6. Setup Desktop Entry & Icons (Copy to /usr/share/icons/hicolor/...)
# 7. Build .deb (dpkg-deb --build)
# 8. Install (apt install ./package.deb)
# 9. Update Icon Cache
```

## 4. Common Pitfalls (Lessons Learned)

*   **"Permission Denied" in Cleanup**: If you `chown root:root` the build dir, a normal `rm -rf` in the trap will fail. Use `sudo rm -rf`.
*   **Missing Icons**: Usually caused by installing to `/opt` and expecting the desktop environment to find it, or failing to update the icon cache.
*   **Apt Download Sandbox**: `apt install ./file.deb` might complain about permission denied if the file is root-owned and in a restricted path. Use standard permissions or ensure the file is readable by `_apt` (though usually `sudo apt install` handles local files fine if they are world-readable).
