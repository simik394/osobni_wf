#!/bin/bash
# detect_changes.sh - Find modified markdown files
# Usage: ./detect_changes.sh [vault_path]

set -e

VAULT_PATH="${1:-.}"
CACHE_FILE="output/.last_scan"

# Get last scan timestamp (0 if never scanned)
if [[ -f "$CACHE_FILE" ]]; then
    LAST_SCAN=$(cat "$CACHE_FILE")
else
    LAST_SCAN=0
fi

# Method 1: Use git if available and in a repo
if git -C "$VAULT_PATH" rev-parse --git-dir &>/dev/null 2>&1; then
    # Get modified and untracked .md files
    git -C "$VAULT_PATH" status --porcelain -uall 2>/dev/null | \
        grep '\.md$' | \
        sed 's/^...//' | \
        while read -r file; do
            if [[ -n "$VAULT_PATH" && "$VAULT_PATH" != "." ]]; then
                echo "$VAULT_PATH/$file"
            else
                echo "$file"
            fi
        done
    
    # Also get files modified since last scan (for committed changes)
    if [[ $LAST_SCAN -gt 0 ]]; then
        find "$VAULT_PATH" -name "*.md" -type f -newermt "@$LAST_SCAN" 2>/dev/null
    fi
else
    # Method 2: Fallback to find with mtime
    if [[ $LAST_SCAN -gt 0 ]]; then
        find "$VAULT_PATH" -name "*.md" -type f -newermt "@$LAST_SCAN" 2>/dev/null
    else
        # First run - scan all
        find "$VAULT_PATH" -name "*.md" -type f 2>/dev/null
    fi
fi | sort -u  # Remove duplicates
