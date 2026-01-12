# Deployment Manifest (Autonomous Implementation)

The following components were implemented/modified and need deployment/configuration.

## 1. RSRCH Agent (Update)
**Why**: CLI now supports offloading to Windmill (`--remote`).
**Action**: Rebuild and Redeploy Docker container.
```bash
cd agents/rsrch
docker-compose build
docker-compose up -d
```

## 2. Yousidian Proxy (New Service)
**Why**: Secure bridge between Windmill/n8n and Obsidian Local REST API.
**Action**: Run locally or deploy as systemd user service.
```bash
# Run Ad-Hoc
cd integrations/yousidian
go run cmd/proxy/main.go --obsidian-token <YOUR_TOKEN>
```

## 3. Windmill Scripts (New/Update)
**Why**: To handle offloaded jobs from `rsrch` and `smart_download`.
**Action**: Ensure the following scripts exist in Windmill on `halvarm`:
- `infra/downloader`: Should execute the logic to download files (requires `gallery-dl` on worker).
- `rsrch/execute`: Should execute `rsrch` CLI commands on the worker.

## 4. MapObsi (New Logic)
**Why**: Prolog rules for validation.
**Action**: None (Library code). Used by `mapobsi` agent when validation is requested.

## 5. Quest Agent (Update)
**Why**: Added capability to dispatch Deep Research tasks.
**Action**: Rebuild/Restart Quest Agent.
```bash
cd agents/questDiscov
# If dockerized:
docker-compose build && docker-compose up -d
# If local:
# Restart the python process
```
