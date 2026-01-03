#!/bin/bash

# Start Xvfb
Xvfb :99 -screen 0 1920x1080x24 &
export DISPLAY=:99

# Start Window Manager
fluxbox &

# Start VNC Server (no password for simplicity in dev)
x11vnc -display :99 -forever -nopw -quiet -listen 0.0.0.0 -xkb &

# Execute the command passed to docker run
exec "$@"
