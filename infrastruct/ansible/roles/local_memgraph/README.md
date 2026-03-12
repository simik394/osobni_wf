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

---

## Neo4j User's Guide to Memgraph Lab

If you are familiar with Neo4j Browser, here is how to navigate Memgraph Lab.

### 1. Key Interface Differences
- **Query Execution**: Found in the left sidebar. Unlike Neo4j's top-bar approach, this is a dedicated IDE view with history and multiple tabs.
- **Graph Style Editor (GSS)**: This is the biggest shift. Instead of clicking UI bubbles to change colors, you use **GSS (Graph Style Script)**—a CSS-like language.
- **MAGE (Procedures)**: Instead of the APOC/GDS plugins, Memgraph has **MAGE** built-in. Use `CALL module.procedure()` just like Neo4j.

### 2. Styling with GSS (CSS for Graphs)
Open the **Graph Style Editor** (palette icon) in the result view.
```css
/* Global Node Style */
@NodeStyle {
  size: 6;
  color: #DD2222;
  label: Property(name);
}

/* Label Specific Styling */
@NodeStyle HasLabel(User) {
  color: #22DD22;
  border-width: 2;
  /* You can even use images! */
  image-url: "https://example.com/icon.png";
}
```

### 3. Common Query Translation
| Task | Neo4j (GDS) | Memgraph (MAGE) |
| :--- | :--- | :--- |
| **PageRank** | `CALL gds.pageRank.stream(...)` | `CALL pagerank.get() YIELD node, rank` |
| **Community** | `CALL gds.louvain.stream(...)` | `CALL community_detection.get() YIELD node, cluster` |
| **Shortest Path**| `MATCH p = shortestPath(...)` | `MATCH p = (n)-[*..10]->(m) RETURN p;` (Native DFS/BFS) |

### 4. Performance & Memory
- **In-Memory**: Everything is in RAM. Use `SHOW STORAGE INFO;` to monitor usage.
- **Durability**: Memgraph takes snapshots and writes WAL logs to `/var/lib/docker/volumes/memgraph-data`.
- **Durability Mode**: Check `SHOW CONFIG;` to see if you are in `IN_MEMORY_ANALYTICAL` (fastest, no persistence) or `IN_MEMORY_TRANSACTIONAL` (safer).

