#!/bin/bash

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# utils -> infrastruct -> root
ROOT_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"
ARTIFACTS_DIR="$ROOT_DIR/_artifacts/reports/storage"
mkdir -p "$ARTIFACTS_DIR"

SERVER="halvarm"
OUTPUT_FILE="$ARTIFACTS_DIR/halvarm_storage_report_$(date +%Y%m%d_%H%M%S).md"

echo "Generating storage report for $SERVER..."
echo "Output file: $OUTPUT_FILE"

# Header
cat <<EOF > "$OUTPUT_FILE"
# Storage Analysis Report: $SERVER

**Date:** $(date)
**Target:** \`$SERVER\` (Remote Server)

## 1. Disk Usage Overview
\`\`\`
$(ssh "$SERVER" "df -h | grep -v tmpfs")
\`\`\`

## 2. Docker Usage Overview
\`\`\`
$(ssh "$SERVER" "docker system df")
\`\`\`

## 3. Large Directories (Top 10)

### Root Partition (/) Excl. /mnt
\`\`\`
$(ssh "$SERVER" "sudo du -hx -d 1 / | sort -hr | head -n 10")
\`\`\`

### Data Partition (/mnt/data)
\`\`\`
$(ssh "$SERVER" "sudo du -h -d 1 /mnt/data | sort -hr | head -n 10")
\`\`\`

### Docker Volumes (Top 10)
\`\`\`
$(ssh "$SERVER" "sudo du -h -d 1 /mnt/data/docker/volumes | sort -hr | head -n 10")
\`\`\`

## 4. Large Log Files (Top 10 Docker JSON Logs)
\`\`\`
$(ssh "$SERVER" "sudo find /mnt/data/docker/containers -name '*-json.log' -exec du -h {} + | sort -hr | head -n 10")
\`\`\`

## 5. System Journal Size
\`\`\`
$(ssh "$SERVER" "journalctl --disk-usage")
\`\`\`

## 6. ClickHouse Internal Storage (System Tables)
\`\`\`
$(ssh "$SERVER" "docker exec langfuse-clickhouse-1 clickhouse-client --query 'SELECT database, table, formatReadableSize(sum(bytes)) as size, sum(bytes) as bytes_raw FROM system.parts GROUP BY database, table ORDER BY bytes_raw DESC LIMIT 10'")
\`\`\`

EOF

echo "Report generated successfully: $OUTPUT_FILE"
