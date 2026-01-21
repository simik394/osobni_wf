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
x11vnc -display $DISPLAY -forever -usepw -create -rfbport 5900 &
VNC_PID=$!

echo "Starting Main Application..."
# Pass all arguments to the main app, or default to serving
# Using exec so node takes over PID 1 if possible, or just waits
if [ "$#" -eq 0 ]; then
    exec node dist/cli.js serve
else
    exec "$@"
fi

# Cleanup on exit
kill $XVFB_PID $VNC_PID
