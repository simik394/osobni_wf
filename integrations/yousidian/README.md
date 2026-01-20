# Yousidian: Obsidian <-> YouTrack Integration

> **Vision**: Seamless "Native" Integration between Personal Knowledge Management (Obsidian) and Project Management (YouTrack).

## Architecture
Based on "Architektonická analýza a implementační strategie" (Dec 2025).

### Phase 1: Connectivity (YOUSIDIAN-3)
**Objective**: Bridge the gap between Localhost (Obsidian) and Cloud/Cluster (YouTrack/Windmill).

**Components**:
1.  **Obsidian Local REST API**: Plugin running on `localhost:27124`.
2.  **Yousidian Proxy** (`cmd/proxy`): A secure Go service that listens for incoming webhooks/requests from the orchestration layer and forwards them to Obsidian.
    *   *Why Proxy?* To handle authentication, TLS termination, and payload transformation (e.g., stripping Markdown) before it hits Obsidian.
3.  **Tunnel**: Cloudflared or Tailscale (Infrastructure level).

### Phase 2: Logic (YOUSIDIAN-4)
**Objective**: Logic and State Synchronization.
-   **Inbound**: YouTrack Workflow -> Webhook -> Proxy -> Obsidian (Patch Frontmatter).
-   **Outbound**: Obsidian Command -> Webhook -> YouTrack (Create Issue).

## Connectivity Layer (Impl)
The `proxy` service implements the following endpoints:
-   `POST /webhook/youtrack`: Receives JSON from YouTrack, transforms it, and patches Obsidian files.
-   `GET /health`: Health check.

### Usage
```bash
go run cmd/proxy/main.go --obsidian-token $OBSIDIAN_TOKEN
```
