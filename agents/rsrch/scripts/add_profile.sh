#!/bin/bash
# Script to add a Google account profile to rsrch via VNC browser
# This opens a new tab, navigates to NotebookLM, and waits for login
# Usage: ./add_profile.sh <profile-name>

set -e

PROFILE_NAME="${1:-personal}"
REMOTE_HOST="halvarm"
CDP_PORT="9223"
RSRCH_CONTAINER="rsrch-server-f0c3c02c-b28a-1efb-acda-49c9e3125c15"

echo "========================================"
echo "Add rsrch Profile: ${PROFILE_NAME}"
echo "========================================"

# 1. Check/create profile directory
echo ""
echo "📁 Setting up profile directory..."
ssh ${REMOTE_HOST} "sudo mkdir -p /opt/rsrch/profiles/${PROFILE_NAME} && \
                    sudo chown -R 1200:1200 /opt/rsrch/profiles/${PROFILE_NAME} && \
                    sudo chmod -R 770 /opt/rsrch/profiles/${PROFILE_NAME}" 2>/dev/null || true
echo "   ✅ Ready"

# 2. Open new tab in VNC browser and navigate to NotebookLM
echo ""
echo "🌐 Opening NotebookLM in a new tab..."

ssh ${REMOTE_HOST} "docker exec ${RSRCH_CONTAINER} node -e \"
const { chromium } = require('playwright');

(async () => {
  try {
    const browser = await chromium.connectOverCDP('http://localhost:${CDP_PORT}');
    
    // Create NEW context (new window) instead of using existing context
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto('https://notebooklm.google.com/', { waitUntil: 'domcontentloaded' });
    console.log('✅ Opened NotebookLM in NEW WINDOW');
    
    // Don't close - leave browser running for user interaction
    await browser.close(); // This just disconnects, doesn't close the browser
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
})();
\""

echo ""
echo "========================================"
echo "📋 NEXT STEPS"
echo "========================================"
echo ""
echo "1. Look at the VNC window (vncviewer ${REMOTE_HOST}:5900)"
echo "   A new tab should be open on NotebookLM"
echo ""
echo "2. In that tab:"
echo "   - If wrong account: Click profile icon → Sign out"
echo "   - Sign in with your ${PROFILE_NAME^^} Gmail account"
echo "   - Wait until you see your notebooks"
echo ""
echo "3. Once logged in, press Enter here to save the session..."
read -p ""

# 3. Save the current browser state to the profile
echo ""
echo "💾 Saving browser state to profile: ${PROFILE_NAME}..."

ssh ${REMOTE_HOST} "docker exec ${RSRCH_CONTAINER} node -e \"
const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  try {
    const browser = await chromium.connectOverCDP('http://localhost:${CDP_PORT}');
    const contexts = browser.contexts();
    if (contexts.length === 0) {
      console.error('No browser contexts found');
      process.exit(1);
    }
    
    // Save from the LAST context (the new window we opened)
    const lastContext = contexts[contexts.length - 1];
    console.log('Found', contexts.length, 'contexts, saving from the last one');
    
    const state = await lastContext.storageState();
    const path = '/opt/rsrch/profiles/${PROFILE_NAME}/auth.json';
    fs.writeFileSync(path, JSON.stringify(state, null, 2));
    console.log('✅ Auth state saved to:', path);
    
    await browser.close();
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
})();
\""

# 4. Verify
echo ""
echo "📋 Profile status:"
ssh ${REMOTE_HOST} "docker exec ${RSRCH_CONTAINER} node dist/index.js profile list"

echo ""
echo "🎉 Done!"
echo ""
echo "To use this profile:"
echo "  rsrch --profile ${PROFILE_NAME} --cdp http://halvarm:9223 notebook list --local"
