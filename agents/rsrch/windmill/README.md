# Windmill Sync Scripts

Scripts to sync Gemini and NotebookLM data to FalkorDB via Windmill.

## Scripts

| Script | Purpose |
|--------|---------|
| `sync_gemini_to_falkor.ts` | Sync Gemini research docs & conversations |
| `sync_notebooklm_to_falkor.ts` | Sync NotebookLM notebooks & sources |
| `sync_all_to_falkor.ts` | Master script - syncs everything |

## Deployment to Windmill

```bash
# Push scripts to Windmill
wmill push --folder agents/rsrch/windmill

# Or deploy individual script
wmill script push f/rsrch/sync_all_to_falkor agents/rsrch/windmill/sync_all_to_falkor.ts
```

## Manual Execution

```bash
# Via Windmill CLI
wmill script run f/rsrch/sync_all_to_falkor

# Via curl to rsrch server directly
curl -X POST http://halvarm:3030/gemini/sync-graph -H "Content-Type: application/json" -d '{"limit": 100}'
```

## Scheduled Execution

In Windmill UI:
1. Go to Schedules
2. Create new schedule for `f/rsrch/sync_all_to_falkor`
3. Set cron: `0 * * * *` (every hour) or `0 0 * * *` (daily)

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `RSRCH_URL` | `http://localhost:3030` | rsrch server URL |

## Required rsrch Server Endpoints

- `POST /gemini/sync-graph` - Sync Gemini to FalkorDB
- `POST /notebook/list` - List NotebookLM notebooks
- `POST /notebook/sync-graph` - Sync notebook to FalkorDB
