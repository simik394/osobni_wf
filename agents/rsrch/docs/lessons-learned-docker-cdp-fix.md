# Lessons Learned: Docker CDP Connection Fix

**Date**: 2026-01-11  
**Issue**: rsrch Docker container could not connect to Chrome browser for Gemini queries

## Problem Summary

The `perplexity-server` Docker container was unable to connect to the `rsrch-chromium` container via Chrome DevTools Protocol (CDP), resulting in "Context not initialized" errors when attempting Gemini research queries.

## Root Causes

### 1. Host Header Validation
Chrome's CDP endpoint rejects connections with non-localhost Host headers by default. When connecting via Docker networking (e.g., `host.docker.internal:9223`), Chrome's security check fails.

**Solution**: Added `--remote-allow-origins=*` flag to Chrome arguments in `browser/server.js`.

### 2. Port Mapping Confusion
The initial configuration used `host.docker.internal:9225` which required traffic to exit the Docker network, re-enter via port mapping, and then reach the container. This added unnecessary complexity and latency.

**Solution**: Changed `BROWSER_CDP_ENDPOINT` to use Docker internal DNS: `http://chromium:9223` - containers communicate directly on the internal network.

### 3. Host Header Rewriting
Even with `--remote-allow-origins=*`, the Chrome CDP endpoint returns `webSocketDebuggerUrl` endpoints using `localhost`, which breaks when the connecting client (perplexity-server) is in a different container.

**Solution**: Replaced the simple `socat` TCP proxy with a Node.js HTTP/WebSocket proxy that:
- Rewrites the `Host` header to `localhost` before forwarding to Chrome
- Rewrites `webSocketDebuggerUrl` in CDP JSON responses to use Docker service names

### 4. FalkorDB Connection Default
The FalkorDB connection defaults to `localhost` if `FALKORDB_HOST` is not set. Inside Docker, `localhost` resolves to the container itself, not the FalkorDB service.

**Solution**: Added `FALKORDB_HOST=falkordb` environment variable and `depends_on` for proper startup ordering.

## Key Files Modified

1. **`docker-compose.yml`**
   - `BROWSER_CDP_ENDPOINT=http://chromium:9223`
   - `FALKORDB_HOST=falkordb`
   - Added `depends_on: [chromium, falkordb]`

2. **`browser/server.js`**
   - Added `--remote-allow-origins=*` to Chrome flags
   - Replaced socat with Node.js HTTP/WS proxy
   - URL rewriting for `webSocketDebuggerUrl`

3. **`src/server.ts`**
   - Added lazy browser initialization in `/gemini/research` endpoint

## Verification Commands

```bash
# Check all containers are running
docker compose ps

# Verify health endpoint shows all dependencies OK
curl -s http://localhost:3001/health | jq .

# Test Gemini research
curl -X POST http://localhost:3001/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"gemini-rsrch","messages":[{"role":"user","content":"What is 2+2?"}]}'
```

## Takeaways

1. **Use Docker internal DNS for container-to-container communication** - Avoid `host.docker.internal` when both services are in the same Docker network.

2. **Chrome CDP requires special handling for non-localhost connections** - The `--remote-allow-origins=*` flag is essential.

3. **URL rewriting may be necessary** - CDP responses contain hardcoded hostnames that need to be rewritten for cross-container compatibility.

4. **Always set explicit host environment variables** - Don't rely on defaults that assume localhost when running in Docker.
