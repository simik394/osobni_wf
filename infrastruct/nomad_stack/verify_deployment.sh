#!/bin/bash
# verify_deployment.sh - Comprehensive deployment verification for Nomad stack
# Usage: ./verify_deployment.sh [--host=halvarm|ntb|all] [-v|--verbose]

set -e

# --- Configuration ---
CLOUD_HOST="halvarm"
LOCAL_HOST="localhost"
CLOUD_IP=""  # Will be fetched dynamically

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Counters
PASS=0
FAIL=0
VERBOSE=false

# --- Argument Parsing ---
TARGET="all"
for arg in "$@"; do
    case $arg in
        --host=*)
            TARGET="${arg#*=}"
            ;;
        -v|--verbose)
            VERBOSE=true
            ;;
        -h|--help)
            echo "Usage: $0 [--host=halvarm|ntb|all] [-v|--verbose]"
            echo ""
            echo "Options:"
            echo "  --host=HOST   Target host (halvarm, ntb, or all). Default: all"
            echo "  -v, --verbose Show detailed output"
            echo "  -h, --help    Show this help message"
            exit 0
            ;;
    esac
done

# --- Helper Functions ---
log_pass() {
    echo -e "  ${GREEN}✓${NC} $1"
    ((PASS++))
}

log_fail() {
    echo -e "  ${RED}✗${NC} $1"
    ((FAIL++))
}

log_info() {
    echo -e "  ${BLUE}ℹ${NC} $1"
}

log_section() {
    echo -e "\n${YELLOW}━━━ $1 ━━━${NC}"
}

run_check() {
    local name="$1"
    local cmd="$2"
    local host="$3"
    
    if [ "$host" == "localhost" ]; then
        if $VERBOSE; then
            echo -e "  ${BLUE}→${NC} Running: $cmd"
        fi
        if eval "$cmd" &>/dev/null; then
            log_pass "$name"
            return 0
        else
            log_fail "$name"
            return 1
        fi
    else
        if $VERBOSE; then
            echo -e "  ${BLUE}→${NC} Running on $host: $cmd"
        fi
        if ssh "$host" "$cmd" &>/dev/null; then
            log_pass "$name"
            return 0
        else
            log_fail "$name"
            return 1
        fi
    fi
}

run_check_output() {
    local name="$1"
    local cmd="$2"
    local host="$3"
    local expected="$4"
    
    local output
    if [ "$host" == "localhost" ]; then
        output=$(eval "$cmd" 2>/dev/null || true)
    else
        output=$(ssh "$host" "$cmd" 2>/dev/null || true)
    fi
    
    if echo "$output" | grep -q "$expected"; then
        log_pass "$name"
        return 0
    else
        log_fail "$name (expected: $expected)"
        if $VERBOSE; then
            echo "    Output: $output"
        fi
        return 1
    fi
}

# --- Get Cloud IP ---
get_cloud_ip() {
    CLOUD_IP=$(ssh "$CLOUD_HOST" "curl -s ifconfig.me" 2>/dev/null || echo "")
    if [ -z "$CLOUD_IP" ]; then
        CLOUD_IP=$(ssh "$CLOUD_HOST" "hostname -I | awk '{print \$1}'" 2>/dev/null || echo "unknown")
    fi
}

# --- Test Functions ---
test_systemd_services() {
    local host="$1"
    local display_name="$2"
    
    log_section "System Services ($display_name)"
    
    for svc in nomad consul vault docker; do
        run_check "$svc.service active" "systemctl is-active $svc" "$host" || true
    done
}

test_cluster_federation() {
    log_section "Cluster Federation"
    
    # Check from cloud host
    log_info "Checking Nomad server members..."
    local members
    members=$(ssh "$CLOUD_HOST" "nomad server members 2>/dev/null" || echo "")
    
    local cloud_alive local_alive
    cloud_alive=$(echo "$members" | grep -c "alive" || echo "0")
    
    if [ "$cloud_alive" -ge 1 ]; then
        log_pass "Nomad cluster has $cloud_alive alive member(s)"
    else
        log_fail "Nomad cluster membership check failed"
    fi
    
    # Check Consul WAN
    log_info "Checking Consul WAN federation..."
    local wan_members
    wan_members=$(ssh "$CLOUD_HOST" "consul members -wan 2>/dev/null | grep -c alive" || echo "0")
    
    if [ "$wan_members" -ge 1 ]; then
        log_pass "Consul WAN has $wan_members alive member(s)"
    else
        log_fail "Consul WAN federation check failed"
    fi
}

test_http_endpoints() {
    local host="$1"
    local ip="$2"
    local display_name="$3"
    
    log_section "HTTP Health Endpoints ($display_name)"
    
    # Core infrastructure endpoints
    run_check "Traefik Dashboard (:8080)" "curl -sf http://127.0.0.1:8080/api/overview" "$host" || true
    run_check "Consul UI (:8500)" "curl -sf http://127.0.0.1:8500/v1/status/leader" "$host" || true
    run_check "Nomad API (:4646)" "curl -sf http://127.0.0.1:4646/v1/status/leader" "$host" || true
    run_check "Vault API (:8200)" "curl -sf http://127.0.0.1:8200/v1/sys/health" "$host" || true
}

test_nomad_jobs() {
    log_section "Nomad Jobs (Cloud)"
    
    local jobs
    jobs=$(ssh "$CLOUD_HOST" "nomad job status -short 2>/dev/null" || echo "")
    
    for job in traefik windmill youtrack n8n obsidian-remote; do
        if echo "$jobs" | grep -q "$job.*running"; then
            log_pass "Job '$job' is running"
        else
            log_fail "Job '$job' not running"
        fi
    done
}

test_consul_dns() {
    local host="$1"
    local display_name="$2"
    
    log_section "Consul DNS ($display_name)"
    
    # Test DNS resolution via Consul's DNS interface
    run_check "Resolve traefik.service.consul" \
        "dig @127.0.0.1 -p 8600 traefik.service.consul +short | grep -q ." \
        "$host" || true
    
    run_check "Resolve consul.service.consul" \
        "dig @127.0.0.1 -p 8600 consul.service.consul +short | grep -q ." \
        "$host" || true
}

# --- Main ---
echo -e "${BLUE}╔════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  Nomad Stack Deployment Verification       ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════╝${NC}"
echo ""
echo "Target: $TARGET"
echo "Verbose: $VERBOSE"

# Get cloud IP for HTTP tests
get_cloud_ip
echo "Cloud IP: $CLOUD_IP"

# Run tests based on target
case $TARGET in
    halvarm|cloud)
        test_systemd_services "$CLOUD_HOST" "halvarm"
        test_http_endpoints "$CLOUD_HOST" "$CLOUD_IP" "halvarm"
        test_nomad_jobs
        test_consul_dns "$CLOUD_HOST" "halvarm"
        test_cluster_federation
        ;;
    ntb|local|localhost)
        test_systemd_services "$LOCAL_HOST" "ntb"
        test_http_endpoints "$LOCAL_HOST" "127.0.0.1" "ntb"
        test_consul_dns "$LOCAL_HOST" "ntb"
        ;;
    all)
        test_systemd_services "$CLOUD_HOST" "halvarm"
        test_systemd_services "$LOCAL_HOST" "ntb"
        test_cluster_federation
        test_http_endpoints "$CLOUD_HOST" "$CLOUD_IP" "halvarm"
        test_nomad_jobs
        test_consul_dns "$CLOUD_HOST" "halvarm"
        test_consul_dns "$LOCAL_HOST" "ntb"
        ;;
    *)
        echo "Unknown target: $TARGET"
        exit 1
        ;;
esac

# --- Summary ---
echo ""
echo -e "${BLUE}━━━ Summary ━━━${NC}"
echo -e "  ${GREEN}Passed:${NC} $PASS"
echo -e "  ${RED}Failed:${NC} $FAIL"

if [ "$FAIL" -gt 0 ]; then
    echo -e "\n${RED}Some checks failed!${NC}"
    exit 1
else
    echo -e "\n${GREEN}All checks passed!${NC}"
    exit 0
fi
