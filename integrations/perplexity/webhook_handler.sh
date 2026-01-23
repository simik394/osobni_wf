#!/bin/bash
set -e

# Read the incoming JSON payload
read -r payload

# Extract the query and citations using jq
query=$(echo "$payload" | jq -r '.query')
citations=$(echo "$payload" | jq -c '.citations')

# Call the Python script with the extracted data
script_dir=$(dirname "$0")
python3 "$script_dir/create_search_node.py" "$query" "$citations"
