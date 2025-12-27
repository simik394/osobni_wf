#!/usr/bin/env python3
import urllib.request
import re
import json
import sys

def get_latest_version():
    url = "https://lmstudio.ai/download"
    try:
        req = urllib.request.Request(
            url, 
            headers={'User-Agent': 'Mozilla/5.0'}
        )
        with urllib.request.urlopen(req) as response:
            html = response.read().decode('utf-8')
            
        # The JSON data is often inside a JS string, so quotes might be escaped \"
        # We use a non-greedy match (.*?) to capture content between potential quotes
        
        # \s* matches whitespace
        # \\? matches optional backslash
        # " matches literal quote
        q = r'\\?"'  # Matches " or \"
        
        pattern = (
            q + r'linux' + q + r':\s*\\?\{\s*' +
            q + r'x64' + q + r':\s*\\?\{\s*' +
            q + r'version' + q + r':\s*' + q + r'(.*?)' + q + r'\s*,\s*' +
            q + r'build' + q + r':\s*' + q + r'(.*?)' + q
        )
        
        match = re.search(pattern, html)
        
        if match:
            # Strip any lingering backslashes (artifacts of escaped JSON)
            version = match.group(1).replace('\\', '')
            build = match.group(2).replace('\\', '')
            
            # Construct version string with build (e.g., 0.3.36-1)
            version_build = f"{version}-{build}"
            final_version_str = version_build
            
            file_name = f"LM-Studio-{final_version_str}-x64.AppImage"
            download_url = f"https://installers.lmstudio.ai/linux/x64/{final_version_str}/{file_name}"
            
            return {
                "version": final_version_str,
                "url": download_url,
                "filename": file_name
            }
        
        # Fallback to simple version regex
        match_simple = re.search(r'(0\.[0-9]+\.[0-9]+)', html)
        if match_simple:
            version = match_simple.group(1)
            print(f"Warning: Could not find build number, defaulting to simple version {version}", file=sys.stderr)
            return {
                 "version": version,
                 "url": f"https://installers.lmstudio.ai/linux/x64/{version}/LM-Studio-{version}-x64.AppImage",
                 "filename": f"LM-Studio-{version}-x64.AppImage"
            }

        print("Could not find version pattern in HTML", file=sys.stderr)
        sys.exit(1)
            
    except Exception as e:
        print(f"Error fetching version: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    result = get_latest_version()
    print(json.dumps(result))
