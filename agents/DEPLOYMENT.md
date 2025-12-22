# Browser Agent Deployment Guide

## Quick Start

### Deploy Everything (First Time)

```bash
cd infrastruct/nomad_stack
ansible-playbook -i inventory.yml playbook.yml --limit servers
```

This will:
1. Create data directories (`/opt/rsrch/chrome-profile`, `/opt/angrav/data`)
2. Copy job specs to `/opt/nomad/jobs/`
3. Start core services (Windmill, Traefik, etc.)
4. **NOT start browser jobs** (they're on-demand)

### Start a Browser Job

```bash
# Option 1: Manual via Nomad CLI
ssh halvarm
nomad job run /opt/nomad/jobs/rsrch-browser.nomad.hcl

# Option 2: Via Windmill script
# Run: f/shared/start-browser with agent="rsrch"

# Option 3: Via Nomad HTTP API
curl -X POST http://nomad.halvarm:4646/v1/job/rsrch-browser \
  -d @/opt/nomad/jobs/rsrch-browser.nomad.hcl
```

---

## Updating Deployments

### After Changing Job Specs

```bash
# 1. Push changes to job templates
cd infrastruct/nomad_stack
ansible-playbook -i inventory.yml playbook.yml --limit servers --tags nomad_jobs

# 2. Re-run the specific job
ssh halvarm
nomad job run /opt/nomad/jobs/rsrch-browser.nomad.hcl
```

### After Changing Windmill Scripts

Windmill scripts live in the UI, not in files. To update:
1. Edit in Windmill UI: `http://windmill.halvarm/`
2. Or use `wmill sync` CLI to push from files

---

## Fresh Browser Profile (Google Auth)

> [!IMPORTANT]
> Google blocks automated logins on cloud servers. You MUST authenticate locally first, then sync the profile to the cloud.

### Step 1: Create Profile Locally

```bash
# On your NTB, run a temporary Chrome with a fresh profile
mkdir -p /tmp/rsrch-profile
chromium-browser \
  --user-data-dir=/tmp/rsrch-profile \
  --disable-blink-features=AutomationControlled \
  https://perplexity.ai
```

Login to Perplexity (and Google if needed) in this browser, then close it.

### Step 2: Sync to Cloud

```bash
# Stop the cloud browser first
ssh halvarm "nomad job stop rsrch-browser"

# Clear old profile on cloud
ssh halvarm "sudo rm -rf /opt/rsrch/chrome-profile/*"

# Sync the authenticated profile to cloud
rsync -avz --delete /tmp/rsrch-profile/ halvarm:/opt/rsrch/chrome-profile/

# Fix permissions
ssh halvarm "sudo chown -R 1000:1000 /opt/rsrch/chrome-profile"

# Restart the browser job
ssh halvarm "nomad job run /opt/nomad/jobs/rsrch-browser.nomad.hcl"
```

### Step 3: Verify

```bash
# Check CDP is responding
curl http://halvarm:9223/json/version

# Or connect via VNC to visually confirm session
vncviewer halvarm:5900
```

### Quick Refresh Script

Save this as `sync-profile.sh`:

```bash
#!/bin/bash
set -e

AGENT="${1:-rsrch}"
LOCAL_PROFILE="${2:-/tmp/${AGENT}-profile}"
REMOTE_HOST="halvarm"

case $AGENT in
  rsrch)
    REMOTE_PATH="/opt/rsrch/chrome-profile"
    JOB_FILE="rsrch-browser.nomad.hcl"
    ;;
  angrav)
    REMOTE_PATH="/opt/angrav/data"
    JOB_FILE="angrav-browser.nomad.hcl"
    ;;
  *)
    echo "Unknown agent: $AGENT"
    exit 1
    ;;
esac

echo "🛑 Stopping ${AGENT} browser on cloud..."
ssh $REMOTE_HOST "nomad job stop ${AGENT}-browser" || true

echo "📤 Syncing profile to ${REMOTE_HOST}:${REMOTE_PATH}..."
ssh $REMOTE_HOST "sudo rm -rf ${REMOTE_PATH}/*"
rsync -avz --delete "${LOCAL_PROFILE}/" "${REMOTE_HOST}:${REMOTE_PATH}/"
ssh $REMOTE_HOST "sudo chown -R 1000:1000 ${REMOTE_PATH}"

echo "🚀 Starting ${AGENT} browser..."
ssh $REMOTE_HOST "nomad job run /opt/nomad/jobs/${JOB_FILE}"

echo "✅ Done! Profile synced and browser started."
```

Usage:
```bash
./sync-profile.sh rsrch /tmp/rsrch-profile
./sync-profile.sh angrav /tmp/angrav-profile
```


---

## Checking Status

```bash
# All jobs
nomad job status

# Specific job
nomad job status rsrch-browser

# Service discovery (via Consul)
curl http://consul.halvarm:8500/v1/health/service/rsrch-browser?passing=true

# Job logs
nomad alloc logs -job rsrch-browser
```

---

## Port Mappings

| Service | CDP Port | VNC Port |
|---------|----------|----------|
| rsrch-browser | 9223 | 5900 |
| angrav-browser | 9224 | 5901 |

Access VNC: `vncviewer halvarm:5900` (no password)

---

## Troubleshooting

### Job Won't Start

```bash
# Check planning
nomad job plan /opt/nomad/jobs/rsrch-browser.nomad.hcl

# Check node constraints
nomad node status -verbose

# Ensure node_class=cloud is set
grep node_class /etc/nomad.d/nomad.hcl
```

### Browser Not Responding

```bash
# Check CDP endpoint
curl http://halvarm:9223/json/version

# Check container logs
nomad alloc logs -job rsrch-browser

# Restart the task
nomad job restart rsrch-browser
```

### Service Not Discoverable

```bash
# Check Consul registration
consul catalog services

# Check service health
consul catalog nodes -service rsrch-browser
```

---

## Architecture

```
                       ┌─────────────────────────────┐
                       │     OCI Halvarm Server      │
                       │                             │
  Ansible Deploy ─────►│  /opt/nomad/jobs/           │
                       │    ├── rsrch-browser.hcl    │
                       │    └── angrav-browser.hcl   │
                       │                             │
                       │  /opt/rsrch/chrome-profile/ │◄── Persistent
                       │  /opt/angrav/data/          │    Chrome Data
                       │                             │
                       │  Nomad ───► Docker          │
                       │    │          │             │
                       │    ▼          ▼             │
                       │  rsrch-browser container    │
                       │    ├── Xvfb :99             │
                       │    ├── VNC :5900            │
                       │    └── Chromium CDP :9223   │
                       │                             │
                       │  Consul ◄─── Service Reg    │
                       └─────────────────────────────┘
                                    ▲
                                    │ CDP Connection
                                    │
                       ┌─────────────────────────────┐
                       │     Windmill Worker         │
                       │  (same or different node)   │
                       │                             │
                       │  input.ts ──► playwright    │
                       │     └──────► getCdpEndpoint │
                       │                  │          │
                       │                  ▼          │
                       │            Consul lookup    │
                       │            "rsrch-browser"  │
                       └─────────────────────────────┘
```
