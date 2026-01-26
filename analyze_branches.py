import subprocess
import sys
import os

def run_command(command):
    try:
        result = subprocess.run(command, shell=True, check=True, capture_output=True, text=True)
        return result.stdout.strip()
    except subprocess.CalledProcessError as e:
        return f"Error: {e.stderr}"

def analyze_branch(branch, base="HEAD"):
    print(f"--- Analyzing {branch} ---")

    # Check if branch exists
    if "Error" in run_command(f"git rev-parse --verify {branch}"):
        print(f"Branch {branch} not found.")
        return

    # Check merge status
    is_ancestor = run_command(f"git merge-base --is-ancestor {branch} {base} && echo 'yes' || echo 'no'")
    print(f"Is ancestor of {base}: {is_ancestor}")

    # Log counts
    ahead = run_command(f"git rev-list --count {base}..{branch}")
    behind = run_command(f"git rev-list --count {branch}..{base}")
    print(f"Commits ahead: {ahead}, Behind: {behind}")

    # Changed files
    diff_files = run_command(f"git diff --name-status {base}...{branch}")
    if diff_files:
        print("Changed files:")
        print(diff_files)
    else:
        print("No file changes (content identical or empty diff).")

    # Content diff (limited)
    if diff_files and int(ahead) > 0:
        print("\nDiff Preview (first 20 lines):")
        diff_content = run_command(f"git diff {base}...{branch} | head -n 20")
        print(diff_content)

    print("\n")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 analyze_branches.py <branch1> [branch2 ...]")
        sys.exit(1)

    branches = sys.argv[1:]
    for br in branches:
        analyze_branch(br)
