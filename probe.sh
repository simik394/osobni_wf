#!/bin/bash
REPORT=".jules-sandbox-results.md"

echo "# Jules VM Sandbox Probe" > $REPORT
echo "Timestamp: $(date -u)" >> $REPORT
echo "Hostname: $(hostname 2>/dev/null || echo DENIED)" >> $REPORT
echo "User: $(whoami 2>/dev/null || echo DENIED)" >> $REPORT
echo "PWD: $(pwd)" >> $REPORT
echo "" >> $REPORT

echo "## System" >> $REPORT
echo "OS: $(uname -a 2>/dev/null)" >> $REPORT
echo "Memory: $(free -h 2>/dev/null | head -2)" >> $REPORT
echo "Disk: $(df -h / 2>/dev/null | tail -1)" >> $REPORT
echo "CPUs: $(nproc 2>/dev/null)" >> $REPORT
echo "" >> $REPORT

echo "## Network Tests" >> $REPORT
echo "DNS (google.com): $(host google.com 2>&1 | head -1)" >> $REPORT
echo "curl google.com: $(curl -s -o /dev/null -w '%{http_code}' --connect-timeout 5 https://google.com 2>/dev/null || echo DENIED)" >> $REPORT
echo "curl api.github.com: $(curl -s -o /dev/null -w '%{http_code}' --connect-timeout 5 https://api.github.com 2>/dev/null || echo DENIED)" >> $REPORT
echo "curl npmjs.org: $(curl -s -o /dev/null -w '%{http_code}' --connect-timeout 5 https://registry.npmjs.org 2>/dev/null || echo DENIED)" >> $REPORT
echo "curl webhook.site: $(curl -s -o /dev/null -w '%{http_code}' --connect-timeout 5 https://webhook.site 2>/dev/null || echo DENIED)" >> $REPORT
echo "curl httpbin.org: $(curl -s -o /dev/null -w '%{http_code}' --connect-timeout 5 https://httpbin.org/get 2>/dev/null || echo DENIED)" >> $REPORT
echo "Public IP: $(curl -s --connect-timeout 5 https://ifconfig.me 2>/dev/null || echo DENIED)" >> $REPORT
echo "ping: $(ping -c 1 -W 3 google.com 2>&1 | head -2 || echo DENIED)" >> $REPORT
echo "" >> $REPORT

echo "## Available Tools" >> $REPORT
for cmd in node npm npx python3 pip3 go java curl wget git docker ssh rsync jq tsc; do
  loc=$(which $cmd 2>/dev/null || echo "NOT FOUND")
  echo "$cmd: $loc" >> $REPORT
done
echo "" >> $REPORT

echo "## Node.js" >> $REPORT
node -e "console.log('Version:', process.version); console.log('Arch:', process.arch); console.log('Platform:', process.platform); console.log('Mem:', Math.round(require('os').totalmem()/1024/1024)+'MB')" >> $REPORT 2>&1
echo "" >> $REPORT

echo "## Process & Permissions" >> $REPORT
echo "UID: $(id 2>/dev/null)" >> $REPORT
echo "sudo: $(sudo -l 2>&1 | head -3)" >> $REPORT
echo "Processes: $(ps aux 2>/dev/null | wc -l)" >> $REPORT
echo "" >> $REPORT

echo "## Environment Variables (sanitized)" >> $REPORT
env 2>/dev/null | grep -v -i "token\|secret\|key\|password\|auth\|cred" | sort >> $REPORT
echo "" >> $REPORT

echo "## IPC" >> $REPORT
echo "mkfifo: $(mkfifo /tmp/test-pipe 2>&1 && echo YES && rm /tmp/test-pipe || echo DENIED)" >> $REPORT
echo "/dev/shm: $(ls /dev/shm 2>/dev/null || echo DENIED)" >> $REPORT
echo "" >> $REPORT

cat $REPORT
