#!/bin/bash
set -e

APP_PATH="$WINEPREFIX/drive_c/Program Files (x86)/reMarkable/reMarkable.exe"

log() {
    echo -e "\033[1;34m[reMarkable-Docker]\033[0m $1"
}

# 0. Ensure D-Bus Session Bus (Required for RpcSs/OLE)
if [ -z "$DBUS_SESSION_BUS_ADDRESS" ]; then
    eval $(dbus-launch --sh-syntax)
    log "D-Bus session bus started."
fi

# 0. Initialize Wine Prefix & Install Dependencies (First Run Only)
if [ ! -f "$WINEPREFIX/.initialized" ]; then
    log "FIRST RUN DETECTED OR PREVIOUS STARTUP WAS INTERRUPTED. INITIALIZING..."
    if [ -d "$WINEPREFIX/drive_c" ]; then
        log "Found broken prefix from interrupted run. Cleaning up..."
        rm -rf "$WINEPREFIX"/* "$WINEPREFIX"/.* 2>/dev/null || true
    fi

    log "Step 1/3: Creating Wine Prefix (fast)..."
    # NOTE: DO NOT CANCEL THE SCRIPT DURING THIS STEP.
    export WINEDLLOVERRIDES="mscoree,mshtml="
    
    # Store host display for later
    HOST_DISPLAY=$DISPLAY
    
    # Start a single persistent Xvfb for the installation phase
    Xvfb :99 -screen 0 1024x768x24 &
    XVFB_PID=$!
    export DISPLAY=:99
    
    wineboot --init
    
    log "Step 2/3: Installing Dependencies (Fonts & Runtimes)..."
    log "Downloading corefonts..."
    winetricks -q corefonts
    
    log "Downloading VC++ 2015 Runtime..."
    winetricks -q vcrun2015
    
    log "Downloading D3D Compiler..."
    winetricks -q d3dcompiler_47
    
    log "Step 3/3: Installing reMarkable App..."
    wine installer.exe install --accept-licenses --default-answer --confirm-command --root "C:\\Program Files (x86)\\reMarkable"
    
    log "Cleanup..."
    # Cleanly wait for all wine processes to finish
    wineserver -w
    
    # Kill the temporary Xvfb and restore the host display
    kill $XVFB_PID
    export DISPLAY=$HOST_DISPLAY
    
    touch "$WINEPREFIX/.initialized"
    log "SETUP COMPLETE. Launching app..."
fi

# 1. Install App if not found (Redundancy)
if [ ! -f "$APP_PATH" ]; then
    log "App not found. Attempting install..."
    # Start temporary Xvfb for fallback install
    HOST_DISPLAY=$DISPLAY
    Xvfb :99 -screen 0 1024x768x24 &
    XVFB_PID=$!
    export DISPLAY=:99
    
    wine installer.exe install --accept-licenses --default-answer --confirm-command --root "C:\\Program Files (x86)\\reMarkable"
    wineserver -w
    
    kill $XVFB_PID
    export DISPLAY=$HOST_DISPLAY
fi

# 2. Launch
if [ -f "$APP_PATH" ]; then
    log "Launching reMarkable..."
    wine "$APP_PATH"
else
    log "ERROR: Executable not found at $APP_PATH"
    exit 1
fi
