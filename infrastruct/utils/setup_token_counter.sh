#!/bin/bash
TARGET_DIR="$(dirname "$0")/libs"
mkdir -p "$TARGET_DIR"
pip3 install --target="$TARGET_DIR" -r "$(dirname "$0")/requirements.txt"
echo "Dependencies installed in $TARGET_DIR"
