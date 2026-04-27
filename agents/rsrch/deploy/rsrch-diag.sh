#!/usr/bin/env bash
# rsrch-diag: Diagnostic utility for rsrch production infrastructure
# Usage: rsrch-diag [--remote] [--fix]
#
# Checks:
#   1. Nomad job health (rsrch server + rsrch-browser)
#   2. CDP port reachability  
#   3. Server /health endpoint
#   4. Browser↔Server connectivity chain
#   5. Auth state validity
#   6. FalkorDB/Graph store connectivity

set -uo pipefail

# --- Config ---
REMOTE_HOST="${RSRCH_REMOTE:-halvarm}"
SERVER_PORT="${RSRCH_PORT:-3055}"
CDP_PORT="${RSRCH_CDP_PORT:-9222}"
HEALTH_PORT="${RSRCH_HEALTH_PORT:-9227}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'
BOLD='\033[1m'

# State tracking
PASS=0
FAIL=0
WARN=0
FIXES_APPLIED=0

# --- Helpers ---
ok()   { echo -e "  ${GREEN}✓${NC} $1"; ((PASS++)); }
fail() { echo -e "  ${RED}✗${NC} $1"; ((FAIL++)); }
warn() { echo -e "  ${YELLOW}⚠${NC} $1"; ((WARN++)); }
info() { echo -e "  ${BLUE}ℹ${NC} $1"; }
section() { echo -e "\n${BOLD}${CYAN}── $1 ──${NC}"; }

is_remote() { [[ "${MODE:-local}" == "remote" ]]; }

run_on_host() {
    if is_remote; then
        ssh "$REMOTE_HOST" "$@" 2>/dev/null
    else
        eval "$@" 2>/dev/null
    fi
}

# --- Checks ---

check_nomad_jobs() {
    section "Nomad Jobs"
    
    # rsrch server
    local server_status
    server_status=$(run_on_host "nomad job status -short rsrch 2>/dev/null | grep -E '^Status' | awk '{print \$3}'" || echo "error")
    if [[ "$server_status" == "running" ]]; then
        ok "rsrch server job: running"
        
        # Get ONLY running alloc ID (match hex ID at start of line)
        local alloc_id
        alloc_id=$(run_on_host "nomad status rsrch 2>/dev/null | grep -E '^[0-9a-f]{8}' | grep 'running' | head -1 | awk '{print \$1}'" || echo "")
        if [[ -n "$alloc_id" ]]; then
            info "Active Alloc ${alloc_id}: status=running"
            CURRENT_SERVER_ALLOC="$alloc_id"
        else
            fail "No running allocation found for rsrch job"
            CURRENT_SERVER_ALLOC=""
        fi
    else
        fail "rsrch server job: ${server_status:-not found}"
        CURRENT_SERVER_ALLOC=""
    fi

    # rsrch-browser  
    local browser_status
    browser_status=$(run_on_host "nomad job status -short rsrch-browser 2>/dev/null | grep -E '^Status' | awk '{print \$3}'" || echo "error")
    if [[ "$browser_status" == "running" ]]; then
        ok "rsrch-browser job: running"
        
        local browser_alloc
        browser_alloc=$(run_on_host "nomad status rsrch-browser 2>/dev/null | grep -E '^[0-9a-f]{8}' | grep 'running' | head -1 | awk '{print \$1}'" || echo "")
        if [[ -n "$browser_alloc" ]]; then
            info "Active Browser alloc: ${browser_alloc}"
            CURRENT_BROWSER_ALLOC="$browser_alloc"
        else
            fail "No running allocation found for rsrch-browser"
            CURRENT_BROWSER_ALLOC=""
        fi
    else
        fail "rsrch-browser job: ${browser_status:-not found}"
        CURRENT_BROWSER_ALLOC=""
    fi
}

check_cdp_port() {
    section "CDP (Chrome DevTools Protocol)"
    
    # Check if port 9222 is listening
    local cdp_listening
    cdp_listening=$(run_on_host "ss -tln | grep ':${CDP_PORT} '" || echo "")
    
    if [[ -n "$cdp_listening" ]]; then
        ok "CDP port ${CDP_PORT}: listening"
    else
        fail "CDP port ${CDP_PORT}: NOT listening"
        info "The browser container is not exposing CDP on port ${CDP_PORT}."
        info "Check: launch-browser.js must pass --remote-debugging-port=${CDP_PORT}"
        return
    fi

    # Try /json/version
    local version_json
    version_json=$(run_on_host "curl -s --connect-timeout 3 http://localhost:${CDP_PORT}/json/version" || echo "")
    
    if [[ -n "$version_json" ]] && echo "$version_json" | grep -q "webSocketDebuggerUrl"; then
        ok "CDP /json/version: reachable"
        local ws_url
        ws_url=$(echo "$version_json" | grep -o '"webSocketDebuggerUrl":"[^"]*"' | cut -d'"' -f4)
        info "WS endpoint: ${ws_url}"
    else
        fail "CDP /json/version: unreachable or malformed"
        info "Response: ${version_json:-<empty>}"
    fi
}

check_server_health() {
    section "Server Health (port ${SERVER_PORT})"
    
    local health_json
    health_json=$(run_on_host "curl -s --connect-timeout 5 http://localhost:${SERVER_PORT}/health" || echo "")

    if [[ -z "$health_json" ]]; then
        fail "Server /health: unreachable"
        return
    fi

    local status browser mode
    status=$(echo "$health_json" | grep -o '"status":"[^"]*"' | cut -d'"' -f4)
    browser=$(echo "$health_json" | grep -o '"browser":"[^"]*"' | cut -d'"' -f4)
    mode=$(echo "$health_json" | grep -o '"mode":"[^"]*"' | cut -d'"' -f4)

    if [[ "$status" == "ok" ]]; then
        ok "Server status: ok"
    else
        fail "Server status: ${status:-unknown}"
    fi

    if [[ "$browser" == "ready" || "$browser" == "connected" ]]; then
        ok "Browser state: ${browser}"
    else
        fail "Browser state: ${browser:-unknown}"
        info "Server has not initialized a browser connection."
        info "Root cause: The server uses LAZY initialization or BROWSER_CDP_ENDPOINT is missing."
    fi
    
    info "Execution mode: ${mode:-unknown}"
}

check_env_config() {
    section "Environment Configuration"
    
    if [[ -n "${CURRENT_SERVER_ALLOC:-}" ]]; then
        # Check BROWSER_CDP_ENDPOINT
        local nomad_env
        nomad_env=$(run_on_host "nomad alloc exec -task server ${CURRENT_SERVER_ALLOC} env 2>/dev/null | grep BROWSER_CDP_ENDPOINT" || echo "")
        
        if [[ -n "$nomad_env" ]]; then
            ok "BROWSER_CDP_ENDPOINT: set (${nomad_env})"
        else
            fail "BROWSER_CDP_ENDPOINT: NOT SET in active server allocation"
            info "The server cannot discover the browser container without this variable."
            info "Fix: Add 'BROWSER_CDP_ENDPOINT = \"http://localhost:${CDP_PORT}\"' to rsrch.nomad env block"
        fi

        # Check PREINTI_BROWSER
        local preinit_env
        preinit_env=$(run_on_host "nomad alloc exec -task server ${CURRENT_SERVER_ALLOC} env 2>/dev/null | grep PREINTI_BROWSER" || echo "")
        
        if [[ -n "$preinit_env" ]]; then
            ok "PREINTI_BROWSER: set (${preinit_env})"
        else
            warn "PREINTI_BROWSER: not set (browser init is lazy)"
        fi
    else
        warn "Cannot check env: no running server allocation found"
    fi
}

check_system_status() {
    section "System Status (Extended)"
    
    local sys_json
    sys_json=$(run_on_host "curl -s --connect-timeout 5 http://localhost:${SERVER_PORT}/system/status" || echo "")

    if [[ -z "$sys_json" ]]; then
        warn "System status endpoint unreachable"
        return
    fi

    local auth_status falkor_status halvarm_status
    auth_status=$(echo "$sys_json" | grep -o '"authStatus":"[^"]*"' | cut -d'"' -f4)
    falkor_status=$(echo "$sys_json" | grep -o '"falkorStatus":"[^"]*"' | cut -d'"' -f4)
    halvarm_status=$(echo "$sys_json" | grep -o '"halvarmStatus":"[^"]*"' | cut -d'"' -f4)

    if [[ "$auth_status" == *"Active"* ]]; then
        ok "Auth: ${auth_status}"
    else
        warn "Auth: ${auth_status:-unknown}"
    fi

    if [[ "$falkor_status" == *"Unreachable"* || "$falkor_status" == *"Error"* ]]; then
        warn "FalkorDB: ${falkor_status} (optional dependency)"
    else
        ok "FalkorDB: ${falkor_status}"
    fi

    info "Halvarm self-check: ${halvarm_status:-unknown}"
}

check_auth_state() {
    section "Authentication State"
    
    local auth_file="/opt/rsrch/secrets/auth.json"
    local auth_exists
    auth_exists=$(run_on_host "test -f ${auth_file} && echo yes || echo no" || echo "no")

    if [[ "$auth_exists" == "yes" ]]; then
        local auth_size
        auth_size=$(run_on_host "wc -c < ${auth_file}" || echo "0")
        if [[ "$auth_size" -gt 100 ]]; then
            ok "Auth file: exists (${auth_size} bytes)"
            
            # Check cookie freshness
            local cookie_count
            cookie_count=$(run_on_host "grep -o '\"name\"' ${auth_file} | wc -l" || echo "0")
            info "Cookies stored: ${cookie_count}"
        else
            warn "Auth file: exists but suspiciously small (${auth_size} bytes)"
        fi
    else
        fail "Auth file: missing at ${auth_file}"
    fi
}

apply_fixes() {
    section "Applying Fixes"
    
    # Fix 1: Add BROWSER_CDP_ENDPOINT to rsrch.nomad if missing
    local nomad_file="/home/sim/Prods/01-pwf/agents/rsrch/deploy/rsrch.nomad"
    if ! grep -q "BROWSER_CDP_ENDPOINT" "$nomad_file" 2>/dev/null; then
        info "Adding BROWSER_CDP_ENDPOINT to rsrch.nomad..."
        sed -i '/FORCE_LOCAL_BROWSER/a\        BROWSER_CDP_ENDPOINT = "http://localhost:9222"' "$nomad_file"
        ok "Added BROWSER_CDP_ENDPOINT = http://localhost:9222"
        ((FIXES_APPLIED++))
    else
        info "BROWSER_CDP_ENDPOINT already present in rsrch.nomad"
    fi

    # Fix 2: Add PREINTI_BROWSER to rsrch.nomad if missing
    if ! grep -q "PREINTI_BROWSER" "$nomad_file" 2>/dev/null; then
        info "Adding PREINTI_BROWSER to rsrch.nomad..."
        sed -i '/BROWSER_CDP_ENDPOINT/a\        PREINTI_BROWSER = "true"' "$nomad_file"
        ok "Added PREINTI_BROWSER = true"
        ((FIXES_APPLIED++))
    else
        info "PREINTI_BROWSER already present in rsrch.nomad"
    fi

    if [[ $FIXES_APPLIED -gt 0 ]]; then
        echo ""
        warn "Fixes applied to local Nomad file. To deploy:"
        info "  1. cd /home/sim/Prods/01-pwf/agents/rsrch"
        info "  2. scp deploy/rsrch.nomad halvarm:/tmp/rsrch.nomad"
        info "  3. ssh halvarm 'nomad job run /tmp/rsrch.nomad'"
    fi
}

# --- Main ---
print_summary() {
    echo ""
    echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BOLD}  rsrch Diagnostic Summary${NC}"
    echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "  ${GREEN}PASS${NC}: ${PASS}"
    echo -e "  ${YELLOW}WARN${NC}: ${WARN}"
    echo -e "  ${RED}FAIL${NC}: ${FAIL}"
    
    if [[ $FIXES_APPLIED -gt 0 ]]; then
        echo -e "  ${CYAN}FIXES${NC}: ${FIXES_APPLIED} applied (redeploy needed)"
    fi
    
    echo ""
    if [[ $FAIL -eq 0 ]]; then
        echo -e "  ${GREEN}${BOLD}VERDICT: READY TO OPERATE ✓${NC}"
    elif [[ $FAIL -le 2 ]]; then
        echo -e "  ${YELLOW}${BOLD}VERDICT: DEGRADED (${FAIL} issues)${NC}"
    else
        echo -e "  ${RED}${BOLD}VERDICT: NOT READY (${FAIL} critical issues)${NC}"
    fi
    echo ""
}

main() {
    echo -e "${BOLD}${CYAN}"
    echo "  ┌─────────────────────────────────────┐"
    echo "  │   rsrch Production Diagnostics      │"
    echo "  │   $(date '+%Y-%m-%d %H:%M:%S')              │"
    echo "  └─────────────────────────────────────┘"
    echo -e "${NC}"

    MODE="local"  # default
    FIX_MODE=false

    for arg in "$@"; do
        case "$arg" in
            --remote) MODE="remote" ;;
            --fix)    FIX_MODE=true ;;
            --help|-h)
                echo "Usage: rsrch-diag [--remote] [--fix]"
                echo "  --remote  Run checks via SSH to \$RSRCH_REMOTE (default: halvarm)"
                echo "  --fix     Attempt automatic fixes for known issues"
                exit 0
                ;;
        esac
    done

    if is_remote; then
        info "Running in REMOTE mode (host: ${REMOTE_HOST})"
    else
        info "Running in LOCAL mode (on this machine)"
    fi

    check_nomad_jobs
    check_cdp_port
    check_server_health
    check_env_config
    check_system_status
    check_auth_state

    if $FIX_MODE; then
        apply_fixes
    fi

    print_summary
}

main "$@"
