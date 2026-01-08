#!/bin/bash
#===============================================================================
# reddit_download.sh - Download Reddit images using curl with browser headers
# Fetches WebP format with descriptive filenames from reddit.com/media URLs
#===============================================================================

set -u

INPUT_FILE="${1:-}"
OUTPUT_DIR="${2:-$HOME/Downloads/reddit_images}"

echo "alias lzd='docker run --rm -it -v /var/run/docker.sock:/var/run/docker.sock -v /yourpath/config:/.config/jesseduffield/lazydocker lazyteam/lazydocker'" >> ~/.zshrc`
echo "alias lzd='docker run --rm -it -v /var/run/docker.sock:/var/run/docker.sock -v /yourpath/config:/.config/jesseduffield/lazydocker lazyteam/lazydocker'" >> ~/.zshrc`
if [[ -z "$INPUT_FILE" ]]; then
    echo "Usage: $0 <input_file> [output_dir] [verbose]"
    exit 1
fi

mkdir -p "$OUTPUT_DIR"

# Extract and decode Reddit URLs from input
REDDIT_URLS=$(grep -E "reddit\.com/media|preview\.redd\.it" "$INPUT_FILE" 2>/dev/null || true)
REDDIT_COUNT=$(echo "$REDDIT_URLS" | grep -c . || echo "0")

if [[ "$REDDIT_COUNT" -eq 0 ]]; then
    echo "No Reddit URLs found"
    exit 0
fi

echo "📷 Found $REDDIT_COUNT Reddit image URLs"
echo "📁 Output: $OUTPUT_DIR"
echo ""

SUCCESS=0
FAILED=0
NUM=1

while IFS= read -r url; do
    [[ -z "$url" ]] && continue
    
    # Decode URL-encoded preview.redd.it URL
    if [[ "$url" =~ reddit\.com/media\?url= ]]; then
        IMAGE_URL=$(echo "$url" | sed 's/.*url=//' | python3 -c "import sys, urllib.parse; print(urllib.parse.unquote(sys.stdin.read().strip()))")
    else
        IMAGE_URL="$url"
    fi
    
    # Extract filename from URL
    if [[ "$IMAGE_URL" =~ preview\.redd\.it/([^?]+) ]]; then
        FILENAME="${BASH_REMATCH[1]}"
        # Replace extension with .webp
        FILENAME=$(echo "$FILENAME" | sed 's/\.\(jpg\|jpeg\|png\|gif\)$/.webp/')
    else
        FILENAME="image_${NUM}.webp"
    fi
    
    # Add numeric prefix
    NUMBERED_FILE=$(printf "%03d_%s" "$NUM" "$FILENAME")
    OUTPUT_PATH="$OUTPUT_DIR/$NUMBERED_FILE"
    
    echo -n "[${NUM}/${REDDIT_COUNT}] ${FILENAME:0:50}... "
    
    # Download with curl using browser-like headers
    if curl -sS -L \
        -H "User-Agent: Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" \
        -H "Accept: image/webp,image/apng,image/*,*/*;q=0.8" \
        -H "Accept-Language: en-US,en;q=0.9" \
        -H "Referer: https://www.reddit.com/" \
        -o "$OUTPUT_PATH" \
        "$IMAGE_URL" 2>/dev/null; then
        
        # Verify it's an image, not HTML
        if file "$OUTPUT_PATH" | grep -qE "(image|WebP|JPEG|PNG)"; then
            echo "✅"
            ((SUCCESS++))
        else
            echo "❌ (got HTML)"
            rm -f "$OUTPUT_PATH"
            ((FAILED++))
        fi
    else
        echo "❌ (curl failed)"
        ((FAILED++))
    fi
    
    ((NUM++))
    
    # Small delay
    sleep 0.1
done <<< "$REDDIT_URLS"

echo ""
echo "═══════════════════════════════════════"
echo "✅ Downloaded: $SUCCESS"
echo "❌ Failed: $FAILED"
echo "📁 Output: $OUTPUT_DIR"
echo "═══════════════════════════════════════"
