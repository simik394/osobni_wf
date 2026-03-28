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
echo "Starting x11vnc..."
x11vnc -display $DISPLAY -forever -nopw -create -shared -rfbport 5900 -desktop "RSRCH-PROD" &
VNC_PID=$!

# Wait for X11 to stabilize
sleep 2

echo "Launching standalone pure Chromium for VNC..."
# Find playwright's chromium or fallback
CHROME_BIN=$(find /ms-playwright -name chrome -type f -executable | head -n 1)
if [ -z "$CHROME_BIN" ]; then
    CHROME_BIN="/usr/bin/google-chrome"
fi

echo "Using Chromium binary: $CHROME_BIN"

# Start pure Chromium on Display 99 with the debug port open
$CHROME_BIN \
    --display=:99 \
    --remote-debugging-port=9223 \
    --remote-debugging-address=0.0.0.0 \
    --user-data-dir=/opt/rsrch/profiles/fresh/state \
    --no-sandbox \
    --disable-setuid-sandbox \
    --disable-gpu \
    --disable-gpu-compositing \
    --ozone-platform=x11 \
    --disable-dev-shm-usage \
    --window-size=1280,1024 \
    --no-first-run \
    --no-default-browser-check \
    --password-store=basic \
    --use-mock-keychain \
    "https://gemini.google.com/app" > /tmp/chrome.log 2>&1 &

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
