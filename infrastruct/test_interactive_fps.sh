#!/bin/bash
# test_interactive_fps.sh
# Interactive testing script for screenshot framerates and codecs

ROOT_DIR="/tmp/screenshot_codec_tests"
mkdir -p "$ROOT_DIR"
echo "Results and raw files will be saved in: $ROOT_DIR"

while true; do
    echo ""
    echo "====================================================="
    echo "Starting a new capture session."
    read -p "Enter a name for this sequence (or press Enter to finish testing): " SEQ_NAME

    if [ -z "$SEQ_NAME" ]; then
        echo "Testing finished. Exiting."
        break
    fi

    # Create valid directory name
    SEQ_NAME=$(echo "$SEQ_NAME" | sed -e 's/[^A-Za-z0-9._-]/_/g')
    SEQ_DIR="$ROOT_DIR/$SEQ_NAME"

    if [ -d "$SEQ_DIR" ]; then
        echo "Warning: Directory $SEQ_DIR already exists. We will overwrite files in it."
    fi
    mkdir -p "$SEQ_DIR/raw_5fps"

    echo ""
    echo "-----------------------------------------------------"
    echo "Ready to capture at 5 FPS for 10 seconds."
    echo "When you press Enter, capture will start immediately."
    echo "You will have 10 seconds to perform your 'interesting sequence'."
    read -p "Press Enter to START CAPTURE... "

    echo "CAPTURING (10 seconds)... PERFORM YOUR ACTIONS NOW!"
    # Capture 50 frames total at 5 FPS
    for i in {0..49}; do
        DISPLAY=:1 scrot -q 80 "$SEQ_DIR/raw_5fps/seq_$(printf '%05d' $i).jpg" 2>/dev/null
        sleep 0.2
    done
    echo "Capture complete."

    # Generate generic subtitles for the 10 seconds
    cat << SRTEOF > "$SEQ_DIR/subs.srt"
1
00:00:00,000 --> 00:00:10,000
Test Subtitle ($SEQ_NAME)
SRTEOF

    echo ""
    echo "Processing data... (Subsampling and encoding)"

    # Subsample directories
    for rate in 1 2 3 4; do
        mkdir -p "$SEQ_DIR/raw_${rate}fps"
        cp "$SEQ_DIR/subs.srt" "$SEQ_DIR/raw_${rate}fps/"
    done
    cp "$SEQ_DIR/subs.srt" "$SEQ_DIR/raw_5fps/"

    # Subsampling logic from the 5fps source
    # 5fps: 50 frames (0,1,2,3,4,5,6,7,8,9,...)
    # 1fps: take every 5th frame (i * 5)
    # 2fps: basically 2.5 fps interval, but since we have 5fps, we take index i * 2.5 rounded
    # 3fps: take index i * (5/3) rounded
    # 4fps: take index i * (5/4) rounded

    # 1 FPS (10 frames)
    for i in {0..9}; do
        idx=$((i * 5))
        SRC=$(printf "seq_%05d.jpg" $idx)
        DST=$(printf "seq_%05d.jpg" $i)
        cp "$SEQ_DIR/raw_5fps/$SRC" "$SEQ_DIR/raw_1fps/$DST"
    done

    # 2 FPS (20 frames, approx matching from 5fps)
    for i in {0..19}; do
        idx=$(awk -v i=$i 'BEGIN {printf "%.0f", i * 2.5}')
        SRC=$(printf "seq_%05d.jpg" $idx)
        DST=$(printf "seq_%05d.jpg" $i)
        cp "$SEQ_DIR/raw_5fps/$SRC" "$SEQ_DIR/raw_2fps/$DST"
    done

    # 3 FPS (30 frames)
    for i in {0..29}; do
        idx=$(awk -v i=$i 'BEGIN {printf "%.0f", i * (5/3)}')
        SRC=$(printf "seq_%05d.jpg" $idx)
        DST=$(printf "seq_%05d.jpg" $i)
        cp "$SEQ_DIR/raw_5fps/$SRC" "$SEQ_DIR/raw_3fps/$DST"
    done

    # 4 FPS (40 frames)
    for i in {0..39}; do
        idx=$(awk -v i=$i 'BEGIN {printf "%.0f", i * 1.25}')
        SRC=$(printf "seq_%05d.jpg" $idx)
        DST=$(printf "seq_%05d.jpg" $i)
        cp "$SEQ_DIR/raw_5fps/$SRC" "$SEQ_DIR/raw_4fps/$DST"
    done

    # Encode everything
    cd "$SEQ_DIR"

    echo "Encoding 1fps AV1 (Baseline)..."
    /usr/lib/jellyfin-ffmpeg/ffmpeg -y -framerate 1 -i raw_1fps/seq_%05d.jpg -c:v libsvtav1 -preset 10 -crf 40 -pix_fmt yuv420p "out_1fps_av1.mkv" 2>/dev/null

    echo "Encoding 1fps x264 (Dup to 5fps)..."
    /usr/lib/jellyfin-ffmpeg/ffmpeg -y -framerate 1 -i raw_1fps/seq_%05d.jpg -r 5 -c:v libx264 -preset veryslow -crf 35 -pix_fmt yuv420p "out_1fps_x264_at_5fps.mkv" 2>/dev/null

    echo "Encoding 2fps x264 (Dup to 5fps)..."
    /usr/lib/jellyfin-ffmpeg/ffmpeg -y -framerate 2 -i raw_2fps/seq_%05d.jpg -r 5 -c:v libx264 -preset veryslow -crf 35 -pix_fmt yuv420p "out_2fps_x264_at_5fps.mkv" 2>/dev/null

    echo "Encoding 3fps x264 (Dup to 5fps)..."
    /usr/lib/jellyfin-ffmpeg/ffmpeg -y -framerate 3 -i raw_3fps/seq_%05d.jpg -r 5 -c:v libx264 -preset veryslow -crf 35 -pix_fmt yuv420p "out_3fps_x264_at_5fps.mkv" 2>/dev/null

    echo "Encoding 4fps x264 (Dup to 5fps)..."
    /usr/lib/jellyfin-ffmpeg/ffmpeg -y -framerate 4 -i raw_4fps/seq_%05d.jpg -r 5 -c:v libx264 -preset veryslow -crf 35 -pix_fmt yuv420p "out_4fps_x264_at_5fps.mkv" 2>/dev/null

    echo "Encoding 5fps x264 (Native 5fps)..."
    /usr/lib/jellyfin-ffmpeg/ffmpeg -y -framerate 5 -i raw_5fps/seq_%05d.jpg -c:v libx264 -preset veryslow -crf 35 -pix_fmt yuv420p "out_5fps_x264.mkv" 2>/dev/null

    echo ""
    echo "--- Results for $SEQ_NAME ---"
    ls -lh out_*.mkv

done

echo "All tests complete. To view results, browse $ROOT_DIR"
