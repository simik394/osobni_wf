#!/bin/bash
# Script to add a Google account to rsrch via VNC browser
# Usage: ./add_profile_via_vnc.sh <profile-name>
#
# This opens a new tab in the EXISTING VNC browser and guides login.
# After login, saves cookies/storage to the profile's auth.json
# NO CONTAINER RESTART NEEDED!

set -e

PROFILE_NAME="${1:-personal}"
REMOTE_HOST="halvarm"
CDP_PORT="9223"

echo "========================================"
echo "Add rsrch Profile: ${PROFILE_NAME}"
echo "========================================"
echo ""

# 1. Check if profile directory exists, create if needed
echo "📁 Checking profile directory..."
if ! ssh ${REMOTE_HOST} "[ -d /opt/rsrch/profiles/${PROFILE_NAME} ]"; then
    echo "   Creating /opt/rsrch/profiles/${PROFILE_NAME}..."
    ssh ${REMOTE_HOST} "sudo mkdir -p /opt/rsrch/profiles/${PROFILE_NAME} && \
                        sudo chown -R 1200:1200 /opt/rsrch/profiles/${PROFILE_NAME} && \
                        sudo chmod -R 770 /opt/rsrch/profiles/${PROFILE_NAME}"
    echo "   ✅ Created"
else
    echo "   ✅ Already exists"
fi

# 2. Check VNC is available
echo ""
echo "🖥️  Checking VNC browser..."
if ! ssh ${REMOTE_HOST} "ss -tln | grep -q ':5900 '"; then
    echo "   ❌ VNC not available on port 5900"
    echo "   Run: ssh halvarm 'nomad job run /opt/nomad/jobs/rsrch-browser.nomad.hcl'"
    exit 1
fi
echo "   ✅ VNC is running"

# 3. Check CDP is available
echo ""
echo "🔌 Checking CDP endpoint..."
CDP_CHECK=$(curl -s "http://${REMOTE_HOST}:${CDP_PORT}/json/version" 2>/dev/null || echo "FAIL")
if [[ "$CDP_CHECK" == "FAIL" ]]; then
    echo "   ❌ CDP not available on port ${CDP_PORT}"
    exit 1
fi
echo "   ✅ CDP is available"

# 4. Instructions for manual login
echo ""
echo "========================================"
echo "📋 INSTRUCTIONS"
echo "========================================"
echo ""
echo "1. Connect to VNC:"
echo "   vncviewer ${REMOTE_HOST}:5900"
echo ""
echo "2. In the VNC browser:"
echo "   - Open a NEW tab (Ctrl+T)"
echo "   - Go to: https://notebooklm.google.com/"
echo "   - If already logged in with wrong account, click profile → 'Sign out'"
echo "   - Log in with your ${PROFILE_NAME^^} Gmail account"
echo "   - Verify you see your notebooks"
echo ""
echo "3. Once logged in, press Enter here to save the session..."
echo ""
read -p "Press Enter after logging in via VNC..."

# 5. Save the current browser state to the profile
echo ""
echo "💾 Saving browser state to profile: ${PROFILE_NAME}..."

# Find the container ID on the remote host
echo "🔍 Finding rsrch-server container..."
RSRCH_CONTAINER=$(ssh ${REMOTE_HOST} "docker ps -qf name=rsrch-server | head -n 1")

if [ -z "$RSRCH_CONTAINER" ]; then
    echo "   ❌ Could not find a running rsrch-server container on ${REMOTE_HOST}"
    exit 1
fi
echo "   ✅ Found container: ${RSRCH_CONTAINER}"

# Use the rsrch server to save auth state
SAVE_CMD="docker exec ${RSRCH_CONTAINER} \
  node -e \"
const { chromium } = require('playwright');
const fs = require('fs');
const path = '/opt/rsrch/profiles/${PROFILE_NAME}/auth.json';

(async () => {
  const browser = await chromium.connectOverCDP('http://localhost:${CDP_PORT}');
  const contexts = browser.contexts();
  if (contexts.length === 0) {
    console.error('No browser contexts found');
    process.exit(1);
  }
  const state = await contexts[0].storageState();
  fs.writeFileSync(path, JSON.stringify(state, null, 2));
  console.log('Auth state saved to: ' + path);
  await browser.close();
})();
\""

ssh ${REMOTE_HOST} "${SAVE_CMD}"

# 6. Verify
echo ""
echo "✅ Profile authentication saved!"
echo ""
echo "📋 Profile status:"
ssh ${REMOTE_HOST} "docker exec ${RSRCH_CONTAINER} node dist/index.js profile list"

echo ""
echo "🎉 Done!"
echo ""
echo "To use this profile:"
echo "  rsrch --profile ${PROFILE_NAME} notebook list --local"
