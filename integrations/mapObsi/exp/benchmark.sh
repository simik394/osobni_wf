#!/bin/bash
# benchmark.sh - Compare Python vs Julia scanner performance
# Usage: ./benchmark.sh [vault_path]
#
# Results are saved to exp/results_TIMESTAMP.md

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
VAULT_PATH="${1:-/home/sim/Obsi/Prods/01-pwf}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
RESULTS_FILE="$SCRIPT_DIR/results_${TIMESTAMP}.md"

# Ensure local julia is found
export PATH="$HOME/.local/bin:$PATH"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}=== mapObsi Scanner Benchmark ===${NC}"
echo "Vault: $VAULT_PATH"
echo "Results: $RESULTS_FILE"
echo ""

# Count files
FILE_COUNT=$(find "$VAULT_PATH" -name "*.md" -type f 2>/dev/null | wc -l)
echo -e "${YELLOW}Found $FILE_COUNT markdown files${NC}"
echo ""

# Create temp files for outputs
PYTHON_OUTPUT="$SCRIPT_DIR/.python_output_$$.json"
JULIA_OUTPUT="$SCRIPT_DIR/.julia_output_$$.json"
FILE_LIST="$SCRIPT_DIR/.file_list_$$.txt"

# Generate file list once
find "$VAULT_PATH" -name "*.md" -type f > "$FILE_LIST"

cleanup() {
    rm -f "$PYTHON_OUTPUT" "$JULIA_OUTPUT" "$FILE_LIST"
}
trap cleanup EXIT

# Initialize results file
cat > "$RESULTS_FILE" << EOF
# Scanner Benchmark Results

**Date:** $(date -Iseconds)
**Vault:** \`$VAULT_PATH\`
**File Count:** $FILE_COUNT

## System Info
- **CPU:** $(grep -m1 "model name" /proc/cpuinfo | cut -d: -f2 | xargs)
- **Cores:** $(nproc)
- **Python:** $(python3 --version 2>&1)
- **Julia:** $(julia --version 2>&1 || echo "not installed")

## Results

| Implementation | Workers | Time (s) | Files/sec | Notes |
|---------------|---------|----------|-----------|-------|
EOF

# Benchmark Python (multiprocessing)
echo -e "${GREEN}Testing Python (multiprocessing)...${NC}"

for workers in 1 2 4 $(nproc); do
    echo -n "  Workers=$workers: "
    
    START_TIME=$(date +%s.%N)
    cat "$FILE_LIST" | python3 "$PROJECT_DIR/scripts/scan.py" \
        --output "$PYTHON_OUTPUT" \
        --workers "$workers" \
        --full 2>/dev/null
    END_TIME=$(date +%s.%N)
    
    ELAPSED=$(echo "$END_TIME - $START_TIME" | bc)
    RATE=$(echo "scale=1; $FILE_COUNT / $ELAPSED" | bc)
    
    echo "${ELAPSED}s (${RATE} files/sec)"
    
    echo "| Python (multiprocessing) | $workers | $ELAPSED | $RATE | tree-sitter |" >> "$RESULTS_FILE"
done

echo ""

# Benchmark Python (Regex)
echo -e "${GREEN}Testing Python (Regex)...${NC}"

for workers in 1 2 4 $(nproc); do
    echo -n "  Workers=$workers: "
    
    START_TIME=$(date +%s.%N)
    cat "$FILE_LIST" | python3 "$PROJECT_DIR/scripts/scan.py" \
        --output "$PYTHON_OUTPUT" \
        --workers "$workers" \
        --regex \
        --full 2>/dev/null
    END_TIME=$(date +%s.%N)
    
    ELAPSED=$(echo "$END_TIME - $START_TIME" | bc)
    RATE=$(echo "scale=1; $FILE_COUNT / $ELAPSED" | bc)
    
    echo "${ELAPSED}s (${RATE} files/sec)"
    
    echo "| Python (multiprocessing) | $workers | $ELAPSED | $RATE | regex |" >> "$RESULTS_FILE"
done

echo ""

# Benchmark Julia (threaded)
if command -v julia &> /dev/null; then
    echo -e "${GREEN}Testing Julia (threaded)...${NC}"
    
    # Install Julia dependencies first
    echo "  Installing Julia dependencies..."
    cd "$PROJECT_DIR/scripts_julia"
    julia --project=. -e 'using Pkg; Pkg.instantiate()' 2>/dev/null || true
    cd "$SCRIPT_DIR"
    
    for threads in 1 2 4 $(nproc); do
        echo -n "  Threads=$threads: "
        
        START_TIME=$(date +%s.%N)
        JULIA_NUM_THREADS=$threads cat "$FILE_LIST" | julia --project="$PROJECT_DIR/scripts_julia" \
            "$PROJECT_DIR/scripts_julia/scan.jl" \
            --output "$JULIA_OUTPUT" \
            --full 2>/dev/null
        END_TIME=$(date +%s.%N)
        
        ELAPSED=$(echo "$END_TIME - $START_TIME" | bc)
        RATE=$(echo "scale=1; $FILE_COUNT / $ELAPSED" | bc)
        
        echo "${ELAPSED}s (${RATE} files/sec)"
        
        echo "| Julia (threaded) | $threads | $ELAPSED | $RATE | regex |" >> "$RESULTS_FILE"
    done
else
    echo -e "${YELLOW}Julia not installed, skipping Julia benchmark${NC}"
    echo "| Julia (threaded) | - | - | - | not installed |" >> "$RESULTS_FILE"
fi

echo ""

# Add summary
cat >> "$RESULTS_FILE" << EOF

## Notes

- Python uses tree-sitter for AST-based parsing
- Julia uses regex-based parsing (no tree-sitter binding)
- Times include file I/O, parsing, and JSON serialization
- Results may vary based on disk cache state

## Raw Output Comparison

- Python output: $FILE_COUNT notes scanned
- Julia output: $(if [ -f "$JULIA_OUTPUT" ]; then python3 -c "import json; print(len(json.load(open('$JULIA_OUTPUT'))))" 2>/dev/null || echo "N/A"; else echo "N/A"; fi) notes scanned
EOF

echo -e "${GREEN}Benchmark complete!${NC}"
echo "Results saved to: $RESULTS_FILE"
cat "$RESULTS_FILE"
