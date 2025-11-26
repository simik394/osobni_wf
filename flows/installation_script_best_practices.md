# Installation Script Best Practices & Methodology

This document outlines the rules, experiences, and methods established for creating robust installation scripts in this project. These practices ensure consistency, system stability, and a clean user experience on Pop!_OS (and Debian-based systems).

## 1. Core Philosophy

*   **Native Packaging**: Do not just extract tarballs to `/opt`. Always wrap them in a temporary `.deb` package. This allows the system package manager (`apt`) to track files, manage updates, and perform clean uninstalls.
*   **Idempotency**: Scripts must be runnable multiple times without side effects. Always check if the target version is already installed before proceeding.
*   **User Experience**: The installation should be silent (except for sudo prompts) and the application must appear in the system menu immediately with the correct icon.

## 2. Key Rules & Methods

### A. Icon Handling (Critical)
Experience has shown that non-standard icon paths (like `/opt/app/icon.png`) are fragile.
*   **Rule**: Always install icons to the **Hicolor Icon Theme** structure.
*   **Path**: `/usr/share/icons/hicolor/<resolution>/apps/<app_name>.png` (e.g., `128x128`, `256x256`, or `scalable`).
*   **Desktop File**: Set `Icon=<app_name>` (no path, no extension).
*   **Cache Update**: You **MUST** run the following commands at the end of the script to force the menu to update immediately:
    ```bash
    if command -v update-desktop-database >/dev/null; then
        sudo update-desktop-database
    fi
    if command -v gtk-update-icon-cache >/dev/null; then
        sudo gtk-update-icon-cache -f -t /usr/share/icons/hicolor
    fi
    ```

### B. Permissions & Sudo
*   **Building**: The package build directory (`WORK_DIR`) should be owned by `root:root` before building the `.deb`.
*   **Cleanup**: When using `trap cleanup EXIT`, ensure `rm -rf "$WORK_DIR"` is run with `sudo` if the directory contains root-owned files (which it will after `chown`).
    ```bash
    cleanup() {
        if [ -d "$WORK_DIR" ]; then
            sudo rm -rf "$WORK_DIR"
        fi
    }
    ```

### C. Download Caching
To speed up re-runs and testing, implement a local cache.
*   **Location**: `/tmp/<app>_cache`
*   **Logic**: Check if the file exists in the cache before downloading.

### D. Version Detection
*   **Remote Check**: Always try to fetch the latest version string dynamically (e.g., via GitHub API or `curl -I` location headers) to ensure the script doesn't become obsolete.

## 3. Standard Script Structure

```bash
#!/bin/bash
set -e

# Configuration
APP_NAME="myapp"
WORK_DIR="/tmp/build_..."

# ... Helper Functions (log_info, check_sudo, cleanup) ...

# 1. Detect Version
# 2. Check Installed Version (Exit if match)
# 3. Prepare Directories (DEBIAN, usr/local/bin, usr/share/icons/...)
# 4. Download (with Cache) & Extract
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
