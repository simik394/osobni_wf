#!/bin/bash
# sync-profile.sh - Sync locally authenticated Chrome profile to cloud
#
# Google blocks automated logins on cloud servers, so you must:
# 1. Login locally in a headless Chrome
# 2. Use this script to sync the profile to the cloud
#
# Usage:
#   ./sync-profile.sh rsrch /tmp/rsrch-profile
#   ./sync-profile.sh angrav /tmp/angrav-profile

set -e

AGENT="${1:-rsrch}"
LOCAL_PROFILE="${2:-/tmp/${AGENT}-profile}"
REMOTE_HOST="${3:-halvarm}"

case $AGENT in
  rsrch)
    REMOTE_PATH="/opt/rsrch/chrome-profile"
    JOB_NAME="rsrch-browser"
    JOB_FILE="rsrch-browser.nomad.hcl"
    CDP_PORT="9223"
    ;;
  angrav)
    REMOTE_PATH="/opt/angrav/data"
    JOB_NAME="angrav-browser"
    JOB_FILE="angrav-browser.nomad.hcl"
    CDP_PORT="9224"
    ;;
  *)
    echo "❌ Unknown agent: $AGENT"
    echo "Usage: $0 <rsrch|angrav> [local_profile_path] [remote_host]"
    exit 1
    ;;
esac

# Check local profile exists
if [ ! -d "$LOCAL_PROFILE" ]; then
  echo "❌ Local profile not found: $LOCAL_PROFILE"
  echo ""
  echo "Create it first with:"
  echo "  mkdir -p $LOCAL_PROFILE"
  echo "  chromium-browser --user-data-dir=$LOCAL_PROFILE https://perplexity.ai"
  echo ""
  echo "Then login and close the browser before running this script."
  exit 1
fi

echo "🛑 Stopping ${JOB_NAME} on ${REMOTE_HOST}..."
ssh "$REMOTE_HOST" "nomad job stop ${JOB_NAME}" 2>/dev/null || true

echo "🗑️  Clearing old profile on ${REMOTE_HOST}..."
ssh "$REMOTE_HOST" "sudo rm -rf ${REMOTE_PATH}/*"

echo "📤 Syncing profile from ${LOCAL_PROFILE} to ${REMOTE_HOST}:${REMOTE_PATH}..."
rsync -avz --delete "${LOCAL_PROFILE}/" "${REMOTE_HOST}:${REMOTE_PATH}/"

echo "🔑 Fixing permissions..."
ssh "$REMOTE_HOST" "sudo chown -R 1000:1000 ${REMOTE_PATH}"

echo "🚀 Starting ${JOB_NAME}..."
ssh "$REMOTE_HOST" "nomad job run /opt/nomad/jobs/${JOB_FILE}"

# Wait for health check
echo "⏳ Waiting for CDP to become available on port ${CDP_PORT}..."
for i in {1..30}; do
  if curl -s "http://${REMOTE_HOST}:${CDP_PORT}/json/version" > /dev/null 2>&1; then
    echo "✅ Done! Browser is ready at ${REMOTE_HOST}:${CDP_PORT}"
    exit 0
  fi
  sleep 1
done

echo "⚠️  Browser started but CDP not responding yet. Check status with:"
echo "   nomad job status ${JOB_NAME}"
