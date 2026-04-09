#!/bin/bash
REPORT=".jules-sandbox-results-v2.md"

echo "# Jules VM Sandbox Probe V2" > $REPORT
echo "Timestamp: $(date -u)" >> $REPORT
echo "" >> $REPORT

echo "## APT & Package Management (Root escalation)" >> $REPORT
echo "sudo apt-get update: $(sudo apt-get update 2>&1 | head -n 3 || echo FAILED)" >> $REPORT
echo "sudo apt-get install -y neofetch: $(sudo DEBIAN_FRONTEND=noninteractive apt-get install -y neofetch 2>&1 | tail -n 2 || echo FAILED)" >> $REPORT
echo "neofetch output: $(neofetch --stdout 2>/dev/null | head -n 5 || echo N/A)" >> $REPORT
echo "" >> $REPORT

echo "## Docker Daemon Check" >> $REPORT
echo "dockerd execution status: $(sudo docker info 2>&1 | head -n 5 || echo 'DAEMON NOT RUNNING OR ACCESSIBLE')" >> $REPORT
echo "docker run hello-world: $(sudo docker run --rm hello-world 2>&1 | head -n 5 || echo FAILED)" >> $REPORT
echo "" >> $REPORT

echo "## Deep Filesystem Exploration" >> $REPORT
echo "Root directory contents: $(sudo ls -la /root 2>&1 | wc -l) items" >> $REPORT
echo "Secrets mounting /tmp search: $(find /tmp -name "*secret*" 2>/dev/null || echo NONE)" >> $REPORT
echo "Systemd status: $(systemctl status 2>&1 | head -n 2 || echo NO_SYSTEMD)" >> $REPORT
echo "" >> $REPORT

echo "## GCP Metadata Endpoint (Exfiltration limit testing)" >> $REPORT
echo "GCP Metadata Ping: $(curl -s -f -H "Metadata-Flavor: Google" --connect-timeout 2 http://169.254.169.254/computeMetadata/v1/instance/name 2>&1 || echo BLOCKED)" >> $REPORT
echo "" >> $REPORT

echo "## Ingress Port Testing (Reverse shell feasibility)" >> $REPORT
echo "Can we bind port 80 as root? $(sudo timeout 1 python3 -m http.server 80 >/dev/null 2>&1; if [ $? -eq 124 ]; then echo 'YES successfully bound port 80'; else echo 'FAILED'; fi)" >> $REPORT
echo "" >> $REPORT

cat $REPORT
