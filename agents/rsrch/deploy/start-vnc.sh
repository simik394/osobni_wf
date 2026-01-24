#!/bin/bash
set -e

# Cleanup old displays
echo "Cleaning up display and profile locks..."
rm -f /tmp/.X*-lock
rm -rf /tmp/.X11-unix/X*

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

echo "System Check:"
pwd
ls -la
ls -la dist || echo "No dist folder found"
node -v

echo "Locating Entrypoint..."
REAL_CLI=$(find dist -name cli.js | head -n 1)
echo "Found CLI at: $REAL_CLI"

echo "Starting Main Application..."
# Pass all arguments to the main app, or default to serving
if [ "$#" -eq 0 ]; then
    exec node "$REAL_CLI" serve
else
    exec "$@"
fi

# Cleanup on exit
kill $XVFB_PID $VNC_PID
