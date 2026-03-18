#!/bin/bash

# Configuration
HOST="${1:-halvarm}"
SRC_FILE="agents/rsrch/src/server.ts"
OUTPUT_FILE="agents/rsrch/docs/API_REFERENCE.md"
API_PORT="3030"

# Ensure tools are in path
export PATH=/usr/bin:/bin:/usr/local/bin:$PATH

echo "Generating API documentation..."
echo "Target Host: $HOST"
echo "Source File: $SRC_FILE"
echo "Output File: $OUTPUT_FILE"

# Start generating the markdown file
cat > "$OUTPUT_FILE" <<EOF
# API Reference

**Auto-generated**: $(date)
**Host**: $HOST
**Port**: $API_PORT

---

## Live Status

EOF

# Live Health Check
echo "Querying health status from $HOST..."
# Use timeout to prevent hanging if host is unreachable
HEALTH_JSON=$(timeout 5s ssh -o BatchMode=yes -o ConnectTimeout=5 "$HOST" "curl -s http://localhost:$API_PORT/health" 2>/dev/null)

if [ -n "$HEALTH_JSON" ]; then
    echo "\`\`\`json" >> "$OUTPUT_FILE"
    # Try to pretty print if python3 is available
    if command -v python3 &>/dev/null; then
        echo "$HEALTH_JSON" | python3 -m json.tool >> "$OUTPUT_FILE" 2>/dev/null || echo "$HEALTH_JSON" >> "$OUTPUT_FILE"
    else
        echo "$HEALTH_JSON" >> "$OUTPUT_FILE"
    fi
    echo "\`\`\`" >> "$OUTPUT_FILE"
else
    echo "*Could not retrieve health status from $HOST*" >> "$OUTPUT_FILE"
fi

echo "" >> "$OUTPUT_FILE"
echo "## Available Models" >> "$OUTPUT_FILE"

# Live Models Check
echo "Querying models from $HOST..."
MODELS_JSON=$(timeout 5s ssh -o BatchMode=yes -o ConnectTimeout=5 "$HOST" "curl -s http://localhost:$API_PORT/v1/models" 2>/dev/null)

if [ -n "$MODELS_JSON" ]; then
    echo "\`\`\`json" >> "$OUTPUT_FILE"
    if command -v python3 &>/dev/null; then
        echo "$MODELS_JSON" | python3 -m json.tool >> "$OUTPUT_FILE" 2>/dev/null || echo "$MODELS_JSON" >> "$OUTPUT_FILE"
    else
        echo "$MODELS_JSON" >> "$OUTPUT_FILE"
    fi
    echo "\`\`\`" >> "$OUTPUT_FILE"
else
    echo "*Could not retrieve models list from $HOST*" >> "$OUTPUT_FILE"
fi

echo "" >> "$OUTPUT_FILE"
echo "---" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

## Endpoints Table
echo "## Endpoints" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"
echo "| Method | Endpoint | Source Line |" >> "$OUTPUT_FILE"
echo "|--------|----------|-------------|" >> "$OUTPUT_FILE"

# Create temporary python parser script
PARSER_SCRIPT="/tmp/rsrch_api_parser.py"
cat > "$PARSER_SCRIPT" << 'EOF'
import sys
import re

for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    # Expected format from grep: line_number:content
    parts = line.split(':', 1)
    if len(parts) < 2:
        continue

    line_num = parts[0]
    content = parts[1]

    # Extract method
    method_match = re.search(r'app\.(get|post|delete|put)', content)
    if not method_match:
        continue
    method = method_match.group(1).upper()

    # Extract path
    path_match = re.search(r"['\"]([^'\"]+)['\"]", content)
    if not path_match:
        continue
    path = path_match.group(1)

    print(f"| {method} | `{path}` | Line {line_num} |")
EOF

# Extract endpoints using grep and the python parser
if command -v python3 &>/dev/null; then
    grep -nE "app\.(get|post|delete|put)\(['\"]" "$SRC_FILE" | python3 "$PARSER_SCRIPT" >> "$OUTPUT_FILE"
else
    echo "Error: Python3 not found, skipping endpoint extraction" >> "$OUTPUT_FILE"
fi

# Cleanup
rm -f "$PARSER_SCRIPT"

echo "" >> "$OUTPUT_FILE"
echo "---" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

## Environment Variables
echo "## Environment Variables" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"
echo "| Variable | Context |" >> "$OUTPUT_FILE"
echo "|----------|---------|" >> "$OUTPUT_FILE"

# Extract process.env usages
grep -r "process.env.[A-Z_]*" "$SRC_FILE" | grep -o "process.env.[A-Z_]*" | sort | uniq | awk -F. '{
    var_name = $3
    if (var_name != "") {
        print "| `" var_name "` | Derived from code analysis |"
    }
}' >> "$OUTPUT_FILE"

# Add known variables
echo "| \`PORT\` | Server Port (default: 3030) |" >> "$OUTPUT_FILE"
echo "| \`BROWSER_CDP_ENDPOINT\` | Chrome/Browser Connection |" >> "$OUTPUT_FILE"
echo "| \`FALKORDB_HOST\` | Knowledge Graph DB Host |" >> "$OUTPUT_FILE"

echo "" >> "$OUTPUT_FILE"
echo "Documentation generated successfully at $OUTPUT_FILE"
