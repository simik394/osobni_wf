#!/bin/bash

# NotebookLM Sync Script
# Synchronizes academic course materials from local directories to NotebookLM.
# Uses 'rsrch' CLI with --local mode connecting to rsrch-browser on halvarm via CDP.
#
# Architecture: CLI (local) --cdp--> rsrch-browser (halvarm:9223) --> NotebookLM
# See: agents/rsrch/docs/architecture_diagram.md

set -euo pipefail

# Configuration
SUBJECT_FILTER="${1:-}"
PROFILES_JSON="${PROFILES_JSON:-/home/sim/Obsi/Prods/01-pwf/integrations/academic/insis/_dumps/insis_subject_profiles.json}"
MGR4_DIR="/home/sim/Obsi/Prods/04-škola/Předměty/mgr4"
CDP_ENDPOINT="${CDP_ENDPOINT:-http://halvarm:9223}"

echo "🚀 Starting NotebookLM Sync..."
if [ -n "$SUBJECT_FILTER" ]; then
    echo "🔎 Filtering for subject: $SUBJECT_FILTER"
fi
echo "📡 Using CDP endpoint: $CDP_ENDPOINT"

# Check prerequisites
for cmd in rsrch jq; do
    if ! command -v "$cmd" &>/dev/null; then
        echo "❌ Error: '$cmd' not found in PATH."
        exit 1
    fi
done

# Common rsrch flags for all commands
RSRCH_FLAGS="--local --cdp $CDP_ENDPOINT"
export FORCE_LOCAL_BROWSER=true

# Function to find or create a notebook
# Returns ONLY the notebook title on stdout; all other output goes to stderr
ensure_notebook() {
    local subject_code="$1"
    local subject_name="$2"

    echo "🔍 Checking for notebook matching: $subject_code" >&2

    # List notebooks via local+CDP and search for matching title
    local notebook_title
    notebook_title=$(rsrch $RSRCH_FLAGS notebook list 2>/dev/null \
        | awk '/^\[$/ {in_json=1} in_json {print} /^\]$/ {in_json=0}' \
        | jq -r ".[] | select(.title | contains(\"$subject_code\")) | .title" \
        | head -n 1) || true

    if [ -z "$notebook_title" ] || [ "$notebook_title" == "null" ]; then
        echo "➕ Notebook not found for $subject_code. Creating: $subject_name" >&2
        rsrch $RSRCH_FLAGS notebook create "$subject_name" >&2
        notebook_title="$subject_name"
    else
        echo "✅ Found existing notebook: $notebook_title" >&2
    fi

    echo "$notebook_title"
}

# Main loop
echo ""
subjects=$(jq -c '.[]' "$PROFILES_JSON")

while read -r subject; do
    [ -z "$subject" ] && continue

    name=$(echo "$subject" | jq -r '.name')

    # Extract course code (e.g. 4IT415) - VSE format: digit + 2 alpha + 3 digits
    code=$(echo "$name" | grep -oE '[0-9][a-zA-Z]{2}[0-9]{3}' | head -n 1)
    if [ -z "$code" ]; then
        echo "⚠️  Could not identify course code in '$name'. Skipping."
        continue
    fi

    if [ -n "$SUBJECT_FILTER" ] && [[ "${code^^}" != "${SUBJECT_FILTER^^}" ]]; then
        continue
    fi

    echo "--------------------------------------------------"
    echo "📚 Processing: $name (Code: $code)"

    subject_dir="$MGR4_DIR/$code"
    if [ ! -d "$subject_dir" ]; then
        echo "⚠️  Directory not found: $subject_dir. Skipping."
        continue
    fi

    # Ensure notebook exists
    notebook_target=$(ensure_notebook "$code" "$name")

    # Gather files from InSIS and Moodle source directories (follow symlinks)
    files_to_upload=()
    sources=(
        "$subject_dir/Veřejný dokumentový server_READONLY"
        "$subject_dir/Moodle_Materiály_READONLY"
    )

    # Add root subject directory markdown/txt files (depth 1)
    if [ -d "$subject_dir" ]; then
        echo "📁 Scanning root: $(basename "$subject_dir")"
        while IFS= read -r file; do
            files_to_upload+=("$file")
        done < <(find -L "$subject_dir" -maxdepth 1 -type f \( -name "*.pdf" -o -name "*.txt" -o -name "*.md" \))
    fi

    for src in "${sources[@]}"; do
        if [ -d "$src" ] || [ -L "$src" ]; then
            echo "📁 Scanning: $(basename "$src")"
            while IFS= read -r file; do
                files_to_upload+=("$file")
            done < <(find -L "$src" -maxdepth 5 -type f \( -name "*.pdf" -o -name "*.txt" -o -name "*.md" \))
        fi
    done

    if [ ${#files_to_upload[@]} -eq 0 ]; then
        echo "ℹ️  No uploadable files found for $code."
        continue
    fi

    # --- NEW LOGIC: Check existing sources to avoid redundant uploads ---
    echo "🔍 Checking existing sources in notebook '$notebook_target'..."
    existing_sources=""
    existing_sources=$(rsrch $RSRCH_FLAGS notebook sources "$notebook_target" --local 2>/dev/null | awk '/^\[$/ {in_json=1} in_json {print} /^\]$/ {in_json=0}' | jq -r '.[].title' || true)

    files_to_upload_filtered=()
    for file in "${files_to_upload[@]}"; do
        filename=$(basename "$file")
        if echo "$existing_sources" | grep -qxF "$filename"; then
            echo "⏭️  Skipping already uploaded source: $filename"
        else
            files_to_upload_filtered+=("$file")
        fi
    done

    # Reassign filtered list back to main array
    files_to_upload=("${files_to_upload_filtered[@]}")

    if [ ${#files_to_upload[@]} -eq 0 ]; then
        echo "✅ All files for $code are already in the notebook. Nothing to sync."
        continue
    fi
    # ------------------------------------------------------------------

    # Determine execution environment and transfer files if necessary
    current_host=$(hostname)
    target_host="halvarm"
    
    if [[ "$current_host" != "$target_host" && "$current_host" != "halvarm.tail288db.ts.net" ]]; then
        echo "🌐 Running remotely (not on $target_host). Preparing to sync files to server..."
        
        # Create a temporary directory on the server
        remote_tmp_dir=$(ssh "$target_host" "mktemp -d -t rsrch_sync_XXXXXX")
        echo "📁 Created temporary directory on server: $remote_tmp_dir"
        
        # Transfer files using rsync
        echo "📡 Transferring ${#files_to_upload[@]} files to $target_host..."
        rsync -a -L -R "${files_to_upload[@]}" "$target_host:$remote_tmp_dir/"
        
        echo "--------------------------------------------------"
        echo "🚧 TODO (Architecture):"
        echo "The files are now available on the server at: $remote_tmp_dir"
        echo "A Windmill worker script needs to be created to process these files sequentially."
        echo "Example trigger: rsrch windmill trigger 'f/rsrch/notebook_upload' --notebook '$notebook_target' --path '$remote_tmp_dir'"
        echo "--------------------------------------------------"
        
    else
        echo "🏠 Running locally on the server."
        echo "--------------------------------------------------"
        echo "🚧 TODO (Architecture):"
        echo "Placeholder: In the future, this will trigger a Windmill worker utilizing a shared volume."
        echo "The shared volume path mapping is not yet strictly defined."
        echo "--------------------------------------------------"
    fi

    echo "⚠️  Fallback: Executing local CDP upload directly for now..."
    echo "📤 Uploading ${#files_to_upload[@]} files to '$notebook_target'..."
    rsrch $RSRCH_FLAGS notebook add-local-source --notebook "$notebook_target" "${files_to_upload[@]}"

    echo "✅ Sync complete for $code."


done <<< "$subjects"

echo ""
echo "✨ All subjects processed!"
