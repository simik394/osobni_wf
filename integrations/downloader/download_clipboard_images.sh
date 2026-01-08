#!/bin/bash
#===============================================================================
# download_clipboard_images.sh - Download images from URLs in clipboard
#===============================================================================
#
# Uses gallery-dl in Docker to handle Reddit's anti-bot protection.
# For sites requiring login, mount your browser cookies.
#
# USAGE:
#   ./download_clipboard_images.sh [folder_name]
#
# EXAMPLES:
#   ./download_clipboard_images.sh
#   ./download_clipboard_images.sh my_images
#
#===============================================================================

set -euo pipefail

FOLDER_NAME="${1:-clipboard_images_$(date +%Y%m%d_%H%M%S)}"
OUTPUT_DIR="$HOME/Downloads/$FOLDER_NAME"
URLS_FILE="/tmp/clipboard_urls_$$.txt"

mkdir -p "$OUTPUT_DIR"
echo "📁 Saving to: $OUTPUT_DIR"

# Get clipboard content
if command -v wl-paste >/dev/null 2>&1; then
    wl-paste 2>/dev/null > "$URLS_FILE" || true
elif command -v xclip >/dev/null 2>&1; then
    xclip -selection clipboard -o 2>/dev/null > "$URLS_FILE" || true
elif command -v pbpaste >/dev/null 2>&1; then
    pbpaste 2>/dev/null > "$URLS_FILE" || true
else
    echo "❌ No clipboard tool found (wl-paste, xclip, or pbpaste)"
    exit 1
fi

# Extract and decode URLs
PROCESSED_URLS="/tmp/processed_urls_$$.txt"
> "$PROCESSED_URLS"

while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    
    # Handle Reddit media wrapper URLs - extract embedded URL
    if [[ "$line" =~ reddit\.com/media\?url= ]]; then
        url=$(echo "$line" | sed 's/.*url=//' | python3 -c "import sys, urllib.parse; print(urllib.parse.unquote(sys.stdin.read().strip()))")
        echo "$url" >> "$PROCESSED_URLS"
    # Direct image URLs
    elif [[ "$line" =~ \.(jpg|jpeg|png|gif|webp) ]]; then
        echo "$line" >> "$PROCESSED_URLS"
    fi
done < "$URLS_FILE"

URL_COUNT=$(wc -l < "$PROCESSED_URLS")
echo "🔗 Found $URL_COUNT image URLs"

if [[ "$URL_COUNT" -eq 0 ]]; then
    echo "No image URLs found in clipboard"
    rm -f "$URLS_FILE" "$PROCESSED_URLS"
    exit 0
fi

# Download using gallery-dl in Docker
echo "⬇️  Downloading with gallery-dl (Docker)..."
docker run --rm -i \
    -v "$OUTPUT_DIR:/downloads" \
    -v "$PROCESSED_URLS:/urls.txt:ro" \
    lasery/gallery-dl:latest \
    --dest /downloads \
    --input-file /urls.txt \
    --no-mtime \
    -o "filename={filename}.{extension}" \
    2>&1 | grep -E '(#|Error|Warning)' || true

# Cleanup
rm -f "$URLS_FILE" "$PROCESSED_URLS"

# Summary
FILE_COUNT=$(find "$OUTPUT_DIR" -type f | wc -l)
echo ""
echo "✅ Download complete!"
echo "   Files: $FILE_COUNT"
echo "   Location: $OUTPUT_DIR"
