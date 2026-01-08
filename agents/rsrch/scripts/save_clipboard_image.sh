#!/bin/bash
# Save clipboard image to a file
# Usage: ./save_clipboard_image.sh [output_filename.png]

OUTPUT_FILE="${1:-clipboard_image.png}"

if command -v wl-paste >/dev/null 2>&1; then
    # Wayland
    wl-paste --type image/png > "$OUTPUT_FILE"
    if [ $? -eq 0 ]; then
        echo "Saved to $OUTPUT_FILE (Wayland)"
        exit 0
    fi
fi

if command -v xclip >/dev/null 2>&1; then
    # X11
    xclip -selection clipboard -t image/png -o > "$OUTPUT_FILE"
    if [ $? -eq 0 ]; then
        echo "Saved to $OUTPUT_FILE (X11)"
        exit 0
    fi
fi

if command -v pngpaste >/dev/null 2>&1; then
    # MacOS
    pngpaste "$OUTPUT_FILE"
    if [ $? -eq 0 ]; then
        echo "Saved to $OUTPUT_FILE (MacOS)"
        exit 0
    fi
fi

echo "Error: No suitable clipboard tool found or clipboard does not contain an image."
echo "Install xclip (Linux X11), wl-clipboard (Linux Wayland), or pngpaste (MacOS)."
exit 1
