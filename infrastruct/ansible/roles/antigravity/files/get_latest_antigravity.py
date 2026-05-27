#!/usr/bin/env python3
import urllib.request
import re
import json
import sys
import platform

def get_latest_version():
    url = "https://antigravity-ide-auto-updater-974169037036.us-central1.run.app/releases"
    try:
        req = urllib.request.Request(
            url, 
            headers={'User-Agent': 'Mozilla/5.0'}
        )
        with urllib.request.urlopen(req) as response:
            html = response.read().decode('utf-8')
            
        data = json.loads(html)
        if not data or not isinstance(data, list):
            print("Error: Invalid response format from releases API", file=sys.stderr)
            sys.exit(1)
            
        latest = data[0]
        version = latest["version"]
        execution_id = latest["execution_id"]
        
        # Detect architecture
        machine = platform.machine()
        if machine in ["x86_64", "amd64"]:
            arch = "linux-x64"
        elif machine in ["aarch64", "arm64"]:
            arch = "linux-arm"
        else:
            print(f"Error: Unsupported architecture: {machine}", file=sys.stderr)
            sys.exit(1)
            
        # Formulate download URL
        if version == "2.0.6":
            download_url = f"https://storage.googleapis.com/antigravity-public/antigravity-hub/{version}-{execution_id}/{arch}/Antigravity.tar.gz"
        else:
            download_url = f"https://edgedl.me.gvt1.com/edgedl/release2/j0qc3/antigravity/stable/{version}-{execution_id}/{arch}/Antigravity%20IDE.tar.gz"
            
        return {
            "version": version,
            "execution_id": execution_id,
            "url": download_url
        }
            
    except Exception as e:
        print(f"Error fetching version: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    result = get_latest_version()
    print(json.dumps(result))
