# Local Memgraph Role

Deploys Memgraph Graph Database as a systemd service on the local machine.

## What It Does

1. Ensures Docker is running
2. Pulls `memgraph/memgraph-mage:latest` image
3. Creates persistent Docker volumes (`memgraph-data`, `memgraph-log`)
4. Deploys systemd service for auto-start on boot
5. Starts Memgraph

## Ports

| Port | Service |
|------|---------|
| 7687 | Bolt (Cypher queries) |
| 3000 | Memgraph Lab (Web UI) |

## Resource Usage

- **RAM**: ~400-500MB baseline (scales with data)
- **CPU**: <1% idle, bursts on queries
- **Disk**: ~300MB image + data volume

## Usage

### Full Deployment
```bash
cd infrastruct/nomad_stack
ansible-playbook -i inventory.yml playbook.yml -K
```

### Local Memgraph Only
```bash
ansible-playbook -i inventory.yml playbook.yml -l local --tags local_memgraph -K
```

## Verification

```bash
# Check service status
systemctl status memgraph

# Check container
docker ps | grep memgraph

# Test connection
docker exec -it memgraph mgconsole
```

## Access

- **Bolt**: `bolt://localhost:7687`
- **Lab UI**: `http://localhost:3000`
