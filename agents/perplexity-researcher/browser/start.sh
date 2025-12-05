#!/bin/bash
rm -f /tmp/.X99-lock
Xvfb :99 -screen 0 1280x1024x24 &
sleep 2
fluxbox &
x11vnc -display :99 -forever -nopw &
export DISPLAY=:99
echo "Starting Playwright Server on port 3000..."
node /app/server.js
