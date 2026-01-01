#!/bin/bash
# Consul Snapshot Backup Script
# Backs up Consul data (including Vault secrets storage) to local directory
# Keeps last 7 days of backups

set -e

BACKUP_DIR="/mnt/data/backups/consul"
BACKUP_NAME="consul-$(date +%Y%m%d-%H%M%S).snap"
CONSUL_ADDR="${CONSUL_HTTP_ADDR:-http://127.0.0.1:8500}"
RETENTION_DAYS=7

# Ensure backup directory exists
mkdir -p "$BACKUP_DIR"

# Create snapshot
echo "[$(date)] Starting Consul backup..."
consul snapshot save "$BACKUP_DIR/$BACKUP_NAME"

# Verify snapshot
if consul snapshot inspect "$BACKUP_DIR/$BACKUP_NAME" > /dev/null 2>&1; then
    echo "[$(date)] ✅ Backup created and verified: $BACKUP_NAME"
    
    # Get size
    SIZE=$(du -h "$BACKUP_DIR/$BACKUP_NAME" | cut -f1)
    echo "[$(date)] Backup size: $SIZE"
else
    echo "[$(date)] ❌ Backup verification failed!"
    rm -f "$BACKUP_DIR/$BACKUP_NAME"
    exit 1
fi

# Cleanup old backups
echo "[$(date)] Cleaning backups older than $RETENTION_DAYS days..."
DELETED=$(find "$BACKUP_DIR" -name "consul-*.snap" -mtime +$RETENTION_DAYS -delete -print | wc -l)
echo "[$(date)] Deleted $DELETED old backup(s)"

# List current backups
echo "[$(date)] Current backups:"
ls -lh "$BACKUP_DIR"/*.snap 2>/dev/null || echo "No backups found"

echo "[$(date)] Backup complete!"
