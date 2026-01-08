#!/bin/bash
#===============================================================================
# smart_download.sh - Universal clipboard image/media downloader
#===============================================================================
#
# Automatically detects URL sources and uses the best download method:
#   - Reddit images: gallery-dl (Docker) - handles anti-bot
#   - Direct image URLs: wget with headers
#   - YouTube/media: yt-dlp (Docker)
#   - General sites: gallery-dl fallback
#
# USAGE:
#   ./smart_download.sh [-v] [-f] [-d] [-q] [-n] [-i file] [folder_name]
#
# OPTIONS:
#   -v         Verbose output (show all gallery-dl output)
#   -f         Flat folder (no subfolders by source)
#   -d         Deep download (download full galleries/archives from exhentai, etc.)
#   -q         Quiet mode (no output, for automation)
#   -n         Send desktop notification when complete
#   -i FILE    Read URLs from file (use "-" for stdin)
#
# EXAMPLES:
#   ./smart_download.sh                    # From clipboard
#   ./smart_download.sh -f my_images       # Flat folder, custom name
#   ./smart_download.sh -d                 # Download full exhentai galleries
#   cat urls.txt | ./smart_download.sh -i - # From stdin
#   ./smart_download.sh -qn                # Quiet + notification (for CopyQ)
#
# REQUIREMENTS:
#   - Docker
#   - copyq, xclip, wl-paste, or pbpaste (for clipboard)
#
#===============================================================================

set -o pipefail

# Parse options
VERBOSE=false
FLAT=false
DEEP=false
QUIET=false
NOTIFY=false
INPUT_FILE=""

while getopts "vfdqni:" opt; do
    case $opt in
        v) VERBOSE=true ;;
        f) FLAT=true ;;
        d) DEEP=true ;;
        q) QUIET=true ;;
        n) NOTIFY=true ;;
        i) INPUT_FILE="$OPTARG" ;;
        *) echo "Usage: $0 [-v] [-f] [-d] [-q] [-n] [-i file] [folder_name]"; exit 1 ;;
    esac
done
shift $((OPTIND-1))

FOLDER_NAME="${1:-downloads_$(date +%Y%m%d_%H%M%S)}"
OUTPUT_DIR="$HOME/Downloads/$FOLDER_NAME"
URLS_FILE="/tmp/clipboard_urls_$$.txt"

# Docker images
GALLERY_DL_IMAGE="mikf123/gallery-dl:latest"
YTDLP_IMAGE="mikenye/youtube-dl:latest"

# Helper for output (respects quiet mode)
log() {
    $QUIET || echo "$@"
}

mkdir -p "$OUTPUT_DIR"
log "📁 Output: $OUTPUT_DIR"

# Get URLs from input file, stdin, or clipboard
if [[ -n "$INPUT_FILE" ]]; then
    if [[ "$INPUT_FILE" == "-" ]]; then
        # Read from stdin
        cat > "$URLS_FILE"
    else
        # Read from file
        cat "$INPUT_FILE" > "$URLS_FILE"
    fi
else
    # Get from clipboard
    get_clipboard() {
        if command -v copyq >/dev/null 2>&1; then
            copyq clipboard 2>/dev/null || true
        elif command -v wl-paste >/dev/null 2>&1; then
            wl-paste 2>/dev/null || true
        elif command -v xclip >/dev/null 2>&1; then
            xclip -selection clipboard -o 2>/dev/null || true
        elif command -v pbpaste >/dev/null 2>&1; then
            pbpaste 2>/dev/null || true
        fi
    }
    get_clipboard > "$URLS_FILE"
fi

# Categorize URLs
REDDIT_MEDIA_URLS="/tmp/reddit_media_$$.txt"  # For direct curl download (best quality)
REDDIT_URLS="/tmp/reddit_$$.txt"
DIRECT_URLS="/tmp/direct_$$.txt"
GALLERY_URLS="/tmp/gallery_$$.txt"
> "$REDDIT_MEDIA_URLS"
> "$REDDIT_URLS"
> "$DIRECT_URLS"
> "$GALLERY_URLS"

while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    url="$line"
    
    # Reddit media wrapper URLs - handle with curl for WebP + descriptive names
    if [[ "$url" =~ reddit\.com/media\?url= ]] || [[ "$url" =~ preview\.redd\.it/ ]]; then
        echo "$line" >> "$REDDIT_MEDIA_URLS"
    # Skip Reddit profile/user URLs (will be handled if we have direct image URLs)
    elif [[ "$url" =~ reddit\.com/(user|u)/ ]]; then
        echo "$url" >> "$REDDIT_URLS"  # Store for later decision
    # Categorize by source (non-Reddit)
    elif [[ "$url" =~ (imgur\.com|twitter\.com|x\.com|pixiv|artstation|deviantart) ]]; then
        echo "$url" >> "$GALLERY_URLS"
    elif [[ "$url" =~ (youtube\.com|youtu\.be|vimeo\.com|twitch\.tv) ]]; then
        echo "$url" >> "$GALLERY_URLS"
    elif [[ "$url" =~ \.(jpg|jpeg|png|gif|webp|mp4|webm)(\?|$) ]]; then
        if [[ "$url" =~ (redd\.it|reddit|imgur) ]]; then
            echo "$url" >> "$GALLERY_URLS"
        else
            echo "$url" >> "$DIRECT_URLS"
        fi
    elif [[ "$url" =~ ^https?:// ]]; then
        echo "$url" >> "$GALLERY_URLS"
    fi
done < "$URLS_FILE"

# If we have direct Reddit media URLs, skip Reddit profile URLs (they would duplicate)
# If we have NO direct Reddit URLs, add profile URLs to gallery-dl queue
REDDIT_MEDIA_COUNT=$(wc -l < "$REDDIT_MEDIA_URLS" | tr -d ' ')
REDDIT_PROFILE_COUNT=$(wc -l < "$REDDIT_URLS" | tr -d ' ')
if [[ "$REDDIT_MEDIA_COUNT" -eq 0 ]] && [[ "$REDDIT_PROFILE_COUNT" -gt 0 ]]; then
    log "ℹ️  No direct Reddit URLs, using profile URLs for gallery-dl"
    cat "$REDDIT_URLS" >> "$GALLERY_URLS"
elif [[ "$REDDIT_PROFILE_COUNT" -gt 0 ]]; then
    log "ℹ️  Skipping $REDDIT_PROFILE_COUNT Reddit profile URLs (have $REDDIT_MEDIA_COUNT direct links)"
fi

# Count
DIRECT_COUNT=$(wc -l < "$DIRECT_URLS" | tr -d ' ')
GALLERY_COUNT=$(wc -l < "$GALLERY_URLS" | tr -d ' ')
TOTAL=$((REDDIT_MEDIA_COUNT + DIRECT_COUNT + GALLERY_COUNT))

log "🔗 Found $TOTAL URLs (reddit: $REDDIT_MEDIA_COUNT, direct: $DIRECT_COUNT, gallery-dl: $GALLERY_COUNT)"

if [[ "$TOTAL" -eq 0 ]]; then
    log "No URLs found in clipboard"
    rm -f "$URLS_FILE" "$REDDIT_MEDIA_URLS" "$REDDIT_URLS" "$DIRECT_URLS" "$GALLERY_URLS"
    exit 0
fi

SUCCESS=0
FAILED=0

# Download Reddit media URLs with curl (WebP + descriptive names)
if [[ "$REDDIT_MEDIA_COUNT" -gt 0 ]]; then
    log ""
    log "📷 Downloading $REDDIT_MEDIA_COUNT Reddit images (WebP)..."
    
    REDDIT_DIR="$OUTPUT_DIR/reddit"
    mkdir -p "$REDDIT_DIR"
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
            FILENAME=$(echo "$FILENAME" | sed 's/\.\(jpg\|jpeg\|png\|gif\)$/.webp/')
        else
            FILENAME="image_${NUM}.webp"
        fi
        
        NUMBERED_FILE=$(printf "%03d_%s" "$NUM" "$FILENAME")
        OUTPUT_PATH="$REDDIT_DIR/$NUMBERED_FILE"
        
        if $VERBOSE; then
            echo -n "  [${NUM}/${REDDIT_MEDIA_COUNT}] ${FILENAME:0:50}... "
        fi
        
        if curl -sS -L \
            -H "User-Agent: Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" \
            -H "Accept: image/webp,image/apng,image/*,*/*;q=0.8" \
            -H "Accept-Language: en-US,en;q=0.9" \
            -H "Referer: https://www.reddit.com/" \
            -o "$OUTPUT_PATH" \
            "$IMAGE_URL" 2>/dev/null; then
            
            if file "$OUTPUT_PATH" 2>/dev/null | grep -qE "(image|WebP|JPEG|PNG)"; then
                $VERBOSE && echo "✅"
                ((SUCCESS++))
            else
                $VERBOSE && echo "❌ (got HTML)"
                rm -f "$OUTPUT_PATH"
                ((FAILED++))
            fi
        else
            $VERBOSE && echo "❌ (curl failed)"
            ((FAILED++))
        fi
        
        ((NUM++))
        sleep 0.1
    done < "$REDDIT_MEDIA_URLS"
fi

# Download direct URLs with wget
if [[ "$DIRECT_COUNT" -gt 0 ]]; then
    echo ""
    echo "📥 Downloading $DIRECT_COUNT direct URLs with wget..."
    while IFS= read -r url; do
        filename=$(basename "${url%%\?*}")
        [[ -z "$filename" ]] && filename="image_$RANDOM.jpg"
        echo -n "  ⬇️  $filename... "
        if wget -q --timeout=10 \
            -U "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36" \
            -O "$OUTPUT_DIR/$filename" "$url" 2>/dev/null; then
            # Verify it's not an error page
            if file "$OUTPUT_DIR/$filename" | grep -q "HTML"; then
                rm -f "$OUTPUT_DIR/$filename"
                echo "❌ (blocked)"
                ((FAILED++))
            else
                echo "✓"
                ((SUCCESS++))
            fi
        else
            echo "❌"
            ((FAILED++))
        fi
    done < "$DIRECT_URLS"
fi

# Download protected URLs with gallery-dl (Docker)
if [[ "$GALLERY_COUNT" -gt 0 ]]; then
    echo ""
    
    # Filter out deep-download sites unless -d is specified
    DEEP_SITES="e-hentai\.org|exhentai\.org"
    if $DEEP; then
        log "📥 Downloading $GALLERY_COUNT URLs with gallery-dl (Docker) [DEEP MODE]..."
    else
        # Count and filter deep URLs
        DEEP_COUNT=$(grep -cE "$DEEP_SITES" "$GALLERY_URLS" 2>/dev/null || echo "0")
        if [[ "$DEEP_COUNT" -gt 0 ]]; then
            log "⚠️  Skipping $DEEP_COUNT exhentai/e-hentai URLs (use -d for deep download)"
            grep -vE "$DEEP_SITES" "$GALLERY_URLS" > "${GALLERY_URLS}.filtered"
            mv "${GALLERY_URLS}.filtered" "$GALLERY_URLS"
            GALLERY_COUNT=$((GALLERY_COUNT - DEEP_COUNT))
        fi
        log "📥 Downloading $GALLERY_COUNT URLs with gallery-dl (Docker)..."
    fi
    
    # Pull image if needed (silent)
    docker pull "$GALLERY_DL_IMAGE" >/dev/null 2>&1 || true
    
    # Build gallery-dl options
    GALLERY_OPTS=(
        --dest /downloads
        --input-file /urls.txt
        --no-mtime
        --no-part
    )
    
    if $FLAT; then
        # Flat: all files in one folder with numbered names
        GALLERY_OPTS+=(-o "directory=[]")
        GALLERY_OPTS+=(-o "filename={num:>03}_{category}_{filename}.{extension}")
    else
        # Default: organize by source with descriptive names
        GALLERY_OPTS+=(-o "filename={num:>03}_{filename}.{extension}")
    fi
    
    if $VERBOSE; then
        # Verbose: show all output
        docker run --rm \
            --user "$(id -u):$(id -g)" \
            -v "$OUTPUT_DIR:/downloads" \
            -v "$GALLERY_URLS:/urls.txt:ro" \
            "$GALLERY_DL_IMAGE" \
            "${GALLERY_OPTS[@]}" \
            2>&1 || true
    else
        # Normal: filter to progress and errors only
        docker run --rm \
            --user "$(id -u):$(id -g)" \
            -v "$OUTPUT_DIR:/downloads" \
            -v "$GALLERY_URLS:/urls.txt:ro" \
            "$GALLERY_DL_IMAGE" \
            "${GALLERY_OPTS[@]}" \
            2>&1 | while read -r line; do
                if [[ "$line" =~ "# " ]]; then
                    echo "  ⬇️  ${line#*# }"
                elif [[ "$line" =~ (error|Error|ERROR) ]]; then
                    echo "  ❌ $line"
                fi
            done || true
    fi
fi

# Cleanup temp files
rm -f "$URLS_FILE" "$REDDIT_MEDIA_URLS" "$REDDIT_URLS" "$DIRECT_URLS" "$GALLERY_URLS"

# Summary
FILE_COUNT=$(find "$OUTPUT_DIR" -type f 2>/dev/null | wc -l)
TOTAL_SIZE=$(du -sh "$OUTPUT_DIR" 2>/dev/null | cut -f1)

log ""
log "════════════════════════════════════════"
log "✅ Download complete!"
log "   Files: $FILE_COUNT"
log "   Size:  $TOTAL_SIZE"
log "   Path:  $OUTPUT_DIR"
log "════════════════════════════════════════"

# Desktop notification
if $NOTIFY && command -v notify-send >/dev/null 2>&1; then
    notify-send -i folder-download "Download Complete" "$FILE_COUNT files ($TOTAL_SIZE)\n$OUTPUT_DIR"
fi
