# rsrch Deployment Workflow

> **Last Updated**: 2026-01-09  
> **Purpose**: Canonical workflow for deploying rsrch changes to halvarm

## Quick Reference

```bash
# From local machine - full deploy
cd ~/Obsi/Prods/01-pwf/agents
rsync -avz --exclude node_modules --exclude .git rsrch/ halvarm:/tmp/build-ctx/rsrch/
rsync -avz --exclude node_modules shared/ halvarm:/tmp/build-ctx/shared/
ssh halvarm 'cd /tmp/build-ctx && docker build -f rsrch/Dockerfile -t localhost:5001/rsrch-server:latest . && docker push localhost:5001/rsrch-server:latest && nomad job run /opt/nomad/jobs/rsrch.nomad.hcl'
```

## Prerequisites

### Local Registry (halvarm:5001)
A local Docker registry runs on halvarm at port 5001:
```bash
# Verify it's running
ssh halvarm 'curl -s http://localhost:5001/v2/_catalog'
# Expected: {"repositories":["rsrch-server"]}

# If not running, start it:
ssh halvarm 'docker run -d -p 5001:5000 --restart=always --name local-registry registry:2'
```

### Build Context Location
Build context on halvarm: `/tmp/build-ctx/`
- `/tmp/build-ctx/rsrch/` - rsrch source
- `/tmp/build-ctx/shared/` - shared modules

## Step-by-Step Deployment

### 1. Sync Code to halvarm
```bash
cd ~/Obsi/Prods/01-pwf/agents
rsync -avz --exclude node_modules --exclude .git rsrch/ halvarm:/tmp/build-ctx/rsrch/
rsync -avz --exclude node_modules shared/ halvarm:/tmp/build-ctx/shared/
```

### 2. Build Docker Image
```bash
ssh halvarm 'cd /tmp/build-ctx && docker build -f rsrch/Dockerfile -t localhost:5001/rsrch-server:latest .'
```

### 3. Push to Local Registry
```bash
ssh halvarm 'docker push localhost:5001/rsrch-server:latest'
```

### 4. Deploy via Nomad
```bash
ssh halvarm 'nomad job run /opt/nomad/jobs/rsrch.nomad.hcl'
```

### 5. Verify Deployment
```bash
# Check allocation health
ssh halvarm 'nomad job allocs rsrch | head -3'

# Check container is using new image
ssh halvarm 'docker inspect $(docker ps -q -f name=rsrch-server) --format "{{.Image}}"'

# Test health endpoint
ssh halvarm 'curl -s http://localhost:3030/health'
```

## Troubleshooting

### Nomad Uses Cached Image
If Nomad doesn't pull the new image:
```bash
# Option 1: Purge and redeploy
ssh halvarm 'nomad job stop -purge rsrch && sleep 3 && nomad job run /opt/nomad/jobs/rsrch.nomad.hcl'

# Option 2: Ensure force_pull=true in job config
ssh halvarm 'grep force_pull /opt/nomad/jobs/rsrch.nomad.hcl'
```

### Version Mismatch Errors
If Playwright version mismatch error appears:
1. Check `package.json` playwright version
2. Check `Dockerfile` base image version
3. **Both must match** (e.g., both v1.57.0)
4. Rebuild and redeploy

### Local Registry Not Running
```bash
ssh halvarm 'docker ps | grep registry || docker run -d -p 5001:5000 --restart=always --name local-registry registry:2'
```

## Nomad Job Configuration

Location: `/opt/nomad/jobs/rsrch.nomad.hcl`

Key settings:
```hcl
config {
  image        = "localhost:5001/rsrch-server:latest"
  force_pull   = true  # Always pull latest from registry
  network_mode = "host"
}
```

## Related Files

| File | Purpose |
|------|---------|
| `agents/rsrch/Dockerfile` | Docker build definition |
| `agents/rsrch/package.json` | npm dependencies (check playwright version) |
| `/opt/nomad/jobs/rsrch.nomad.hcl` | Nomad job definition (on halvarm) |
| `infrastruct/nomad_stack/roles/nomad_jobs/templates/rsrch.nomad.hcl.j2` | Ansible template for job |
