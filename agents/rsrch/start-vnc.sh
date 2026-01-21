#!/bin/bash
set -e

# Defaults
export DISPLAY=:99
export RESOLUTION="${RESOLUTION:-1920x1080x24}"

echo "Starting Xvfb on $DISPLAY with resolution $RESOLUTION..."
Xvfb $DISPLAY -screen 0 $RESOLUTION &
XVFB_PID=$!

echo "Waiting for Xvfb..."
sleep 2

echo "Starting Fluxbox..."
fluxbox &

echo "Starting x11vnc on port 5900..."
# -forever: keep listening after client disconnects
# -shared: allow multiple clients
# -display: usage of specific display
# -bg: run in background (but we want to see logs, so maybe not bg for main process? No, we need to run node too)
x11vnc -display $DISPLAY -forever -shared -nopw -listen 0.0.0.0 -xkb &
VNC_PID=$!

echo "Starting Main Application..."
# Pass all arguments to the main app, or default to serving
# Using exec so node takes over PID 1 if possible, or just waits
if [ "$#" -eq 0 ]; then
    node dist/cli.js serve
else
    exec "$@"
fi

# Cleanup on exit
kill $XVFB_PID $VNC_PID
