#!/bin/bash
# rsrch VNC & API Status Dashboard

REMOTE_HOST="halvarm"
API_PORT=3055
VNC_PORT=5900
CDP_PORT=9223

echo "----------------------------------------------------"
echo "🔍 Checking rsrch Service Status on $REMOTE_HOST"
echo "----------------------------------------------------"

# 1. Check Nomad Job
JOB_STATUS=$(ssh $REMOTE_HOST "nomad job status rsrch" | grep -E "Summary|server" | grep "1" | grep "running" -i || echo "NOT_FOUND")
echo -n "📝 Nomad Job: "
if [[ $JOB_STATUS != "NOT_FOUND" ]]; then
    echo -e "🟢 RUNNING"
else
    echo -e "🔴 NOT RUNNING or STARTING"
fi

# 2. Check API Gateway
ssh $REMOTE_HOST "nc -z localhost $API_PORT" > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo -e "📡 API Gateway (:$API_PORT): 🟢 ONLINE"
    HEALTH=$(ssh $REMOTE_HOST "curl -s http://localhost:$API_PORT/health" | jq -r '.status')
    echo "   ↳ Health Check: $HEALTH"
else
    echo -e "📡 API Gateway (:$API_PORT): 🔴 OFFLINE"
fi

# 3. Check VNC Display
ssh $REMOTE_HOST "nc -z localhost $VNC_PORT" > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo -e "🖥️  VNC Display (:$VNC_PORT): 🟢 AVAILABLE (Connect to $REMOTE_HOST:5900)"
else
    echo -e "🖥️  VNC Display (:$VNC_PORT): 🔴 UNAVAILABLE"
fi

# 4. Check CDP (Playwright Connection)
ssh $REMOTE_HOST "nc -z localhost $CDP_PORT" > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo -e "🤖 CDP Port (:$CDP_PORT): 🟢 READY"
else
    echo -e "🤖 CDP Port (:$CDP_PORT): 🔴 DISCONNECTED"
fi

echo "----------------------------------------------------"
