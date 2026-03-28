#!/bin/bash
set -e

# Cleanup old displays
echo "Cleaning up display and profile locks..."
rm -f /tmp/.X*-lock
rm -rf /tmp/.X11-unix/X*

# Ensure DISPLAY is set
export DISPLAY=${DISPLAY:-:99}

# Start Xvfb
echo "Starting Xvfb on $DISPLAY..."
Xvfb $DISPLAY -screen 0 1920x1080x24 &
XVFB_PID=$!
sleep 2

# Start Window Manager
echo "Starting Fluxbox..."
fluxbox &

# Start x11vnc with explicit name and cleanup
echo "Starting x11vnc on $DISPLAY..."
x11vnc -display $DISPLAY -forever -nopw -shared -rfbport 5900 -desktop "RSRCH-PROD" &
VNC_PID=$!

# Wait for X11 to stabilize
sleep 2

echo "Launching Node Playwright browser for VNC..."
node /app/agents/rsrch/deploy/launch-browser.js > /tmp/chrome.log 2>&1 &
CHROMIUM_PID=$!

# Wait for Chromium to stabilize
sleep 3

echo "Starting Main Application..."
# Using absolute path to ensure it works even if PATH is different in container
ENTRYPOINT="/app/agents/rsrch/dist/cli/main.js"
if [ ! -f "$ENTRYPOINT" ]; then
    echo "❌ ERROR: Entrypoint not found at $ENTRYPOINT"
    ls -R /app/agents/rsrch/dist
    exit 1
fi

if [ "$#" -eq 0 ]; then
    export BROWSER_CDP_ENDPOINT="http://127.0.0.1:9223"
    exec node "$ENTRYPOINT" serve --port 3055
else
    # Allow passing arguments correctly
    export BROWSER_CDP_ENDPOINT="http://127.0.0.1:9223"
    exec node "$ENTRYPOINT" "$@"
fi

# Cleanup on exit (will only reach if exec is replaced by something else)
kill $XVFB_PID $VNC_PID $CHROMIUM_PID
