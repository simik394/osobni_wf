#!/bin/bash
set -e

# Defaults
export DISPLAY=:20
rm -f /tmp/.X20-lock

# Start Xvfb
echo "Starting Xvfb on $DISPLAY..."
Xvfb $DISPLAY -screen 0 1920x1080x24 &
XVFB_PID=$!
sleep 2

# Start Window Manager
echo "Starting Fluxbox..."
fluxbox &

# Start x11vnc
echo "Starting x11vnc..."
x11vnc -display $DISPLAY -forever -nopw -create -rfbport 5900 &
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
