# Rsrch Network Architecture on Halvarm

> **Last verified**: 2026-01-22T01:00:00+01:00

## Quick Reference

| Service | Port | Description |
|---------|------|-------------|
| **rsrch API** | `3030` | Main HTTP API (OpenAI-compatible) |
| **Chrome CDP** | `9221` | Authenticated Chrome browser (localhost only) |
| **VNC** | `5900` | Browser UI access (display :99) |
| **FalkorDB** | `6379` | Graph database |

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           HALVARM SERVER                                 │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   ┌──────────────────────┐         ┌──────────────────────────────────┐ │
│   │  rsrch-prod          │         │  Authenticated Chrome            │ │
│   │  (--network host)    │   CDP   │  (Long-running, display :99)     │ │
│   │                      │◄───────►│                                  │ │
│   │  Port 3030 (API)     │  :9221  │  - Logged into Google            │ │
│   │                      │         │  - Gemini PRO access             │ │
│   └──────────────────────┘         │  - Visible via VNC :5900         │ │
│            ▲                       └──────────────────────────────────┘ │
│            │                                      ▲                      │
│            │                                      │ x11vnc               │
│   ┌────────┴────────┐              ┌──────────────┴───────────────────┐ │
│   │  FalkorDB       │              │  Xvfb :99                        │ │
│   │  Port 6379      │              │  (Virtual framebuffer)           │ │
│   └─────────────────┘              └──────────────────────────────────┘ │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
          ▲                                         ▲
          │ HTTP API                                │ VNC Viewer
          │                                         │
┌─────────┴───────────────────────────────────────┴─────────────────────┐
│                     EXTERNAL ACCESS                                    │
├────────────────────────────────────────────────────────────────────────┤
│  curl http://halvarm:3030/v1/chat/completions   vncviewer halvarm:5900 │
│  MCP: mcp_jules-windmill_rsrch_gemini                                  │
└────────────────────────────────────────────────────────────────────────┘
```

## Starting rsrch-prod

**CRITICAL**: The rsrch server must connect to the existing authenticated Chrome via CDP, NOT launch its own browser.

```bash
# CORRECT: Connect to existing authenticated browser
docker run -d --name rsrch-prod --network host \
  -e PORT=3030 \
  -e BROWSER_CDP_ENDPOINT=http://localhost:9221 \
  -v /home/sim/.rsrch/profiles:/opt/rsrch/profiles \
  ghcr.io/simik394/osobni_wf/rsrch:vnc node dist/cli.js serve

# WRONG: This launches a new unauthenticated browser
docker run -d --name rsrch-prod --network host \
  -e PORT=3030 \
  ghcr.io/simik394/osobni_wf/rsrch:vnc ./start-vnc.sh
```

## Verification Commands

```bash
# 1. Check rsrch API health
curl -s http://halvarm:3030/health | jq .
# Expected: {"status":"ok","dependencies":{"falkordb":"ok","browser":"ok"}}

# 2. Test chat completion
curl -X POST http://halvarm:3030/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"gemini-flash","messages":[{"role":"user","content":"Say TEST"}]}'

# 3. Check CDP is accessible
curl -s http://localhost:9221/json/version
# Expected: {"Browser":"Chrome/124.0.6367.78",...}

# 4. List active ports
ss -tlnp | grep -E "(3030|9221|5900|6379)"
```

## MCP Access

The rsrch API is accessible via jules-windmill MCP tools:

```
mcp_jules-windmill_rsrch_gemini        - Standard Gemini chat
mcp_jules-windmill_rsrch_deep_research - Deep Research mode
```

These tools route through Windmill → rsrch API on port 3030.

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| "Browser not initialized" | rsrch not connected to CDP | Restart with `BROWSER_CDP_ENDPOINT` |
| "Gemini requires authentication" | New browser launched, not authenticated | Use existing Chrome on 9221 |
| VNC shows nothing | Xvfb not running | Check display :99 processes |
| Port 3030 in use | Old container still running | `docker stop rsrch-prod` |

## Cleanup Old Containers

```bash
# Stop all rsrch containers except rsrch-prod
docker ps -a --format "{{.Names}}" | grep rsrch | grep -v rsrch-prod | xargs -r docker rm -f

# Cleanup script
ssh halvarm 'docker stop rsrch-prod 2>/dev/null; docker rm rsrch-prod 2>/dev/null'
```
