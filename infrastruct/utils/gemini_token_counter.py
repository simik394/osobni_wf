
import os
import sys

# Add local libs to path
script_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.append(os.path.join(script_dir, "libs"))

import glob
import mimetypes
import time
import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
import google.generativeai as genai
from tqdm import tqdm
import pathspec

# Configuration
DEFAULT_MODEL = 'models/gemini-2.0-flash'
BATCH_SIZE = 25  # Number of files to batch in one API call
MAX_RETRIES = 5
RETRY_DELAY = 2  # Seconds

def is_text_file(filepath):
    """Check if a file is likely a text file."""
    # Common text extensions to be sure
    text_exts = {'.md', '.txt', '.py', '.js', '.ts', '.html', '.css', '.json', '.yaml', '.yml', '.sh', '.go', '.rs', '.java', '.c', '.cpp', '.h'}
    ext = os.path.splitext(filepath)[1].lower()
    if ext in text_exts:
        return True
    
    # Guess using mimetypes
    mime_type, _ = mimetypes.guess_type(filepath)
    if mime_type and mime_type.startswith('text'):
        return True
    
    # Heuristic: Read first chunk
    try:
        with open(filepath, 'rb') as f:
            chunk = f.read(1024)
            if b'\0' in chunk:
                return False
            # Check if decodable as utf-8
            chunk.decode('utf-8')
            return True
    except Exception:
        return False

def count_tokens_batch(model, texts):
    """Count tokens for a batch of text."""
    for attempt in range(MAX_RETRIES):
        try:
            # Join texts with a separator? No, passing list avoids concatenation tokens?
            # actually model.count_tokens accepts a list of strings
            response = model.count_tokens(texts)
            return response.total_tokens
        except Exception as e:
            if "429" in str(e) or "ResourceExhausted" in str(e):
                time.sleep(RETRY_DELAY * (2 ** attempt))
                continue
            print(f"Error counting tokens: {e}")
            return 0
    return 0

def get_files_to_process(root_dir, exclude_patterns=None):
    """
    Walk directory and return list of files to process.
    Respects common ignore patterns and additional exclusions.
    """
    # Standard ignores
    default_ignores = [
        '.git', '.svn', '.hg', 'node_modules', 'venv', '.venv', '__pycache__', 
        '.DS_Store', 'dist', 'build', 'coverage', '.idea', '.vscode', 'vendor'
    ]
    
    # Merge user patterns, ensure no duplicates
    ignores = set(default_ignores)
    if exclude_patterns:
        ignores.update(exclude_patterns)
    
    # Load .gitignore if exists in root
    gitignore_path = os.path.join(root_dir, '.gitignore')
    spec = None
    if os.path.exists(gitignore_path):
        with open(gitignore_path, 'r') as f:
            spec = pathspec.PathSpec.from_lines('gitwildmatch', f)

    file_list = []
    
    print(f"Scanning files in {root_dir}...")
    # print(f"Ignoring directories: {', '.join(sorted(ignores))}")
    
    for root, dirs, files in os.walk(root_dir):
        # Filter directories in-place
        # dirs[:] = [d for d in dirs if d not in ignores]
        # Rewrite to be explicit for debugging
        original_dirs = list(dirs)
        dirs[:] = []
        for d in original_dirs:
            if d in ignores:
                # Debug print to confirm it's working
                # print(f"DEBUG: Skipping directory {d} in {root}")
                continue
            dirs.append(d)
        
        # Also filter by gitignore spec for directories if needed
        # gitignore often applies to dirs too.
        # If pathspec matches the directory, we should also skip it
        # But separate standard ignores first.
        
        # Apply gitignore to remaining dirs
        if spec:
             # We need to check relpath for directories
             # We must iterate over a copy again or be careful
             valid_dirs = []
             for d in dirs:
                 d_path = os.path.join(root, d)
                 d_rel = os.path.relpath(d_path, root_dir)
                 # pathspec match_file can match directories if they end in / often
                 # but let's try match_file first
                 # actually pathspec behavior on directories depends on strictness.
                 # Let's assume ignoring 'node_modules/' pattern works.
                 
                 # NOTE: pathspec might be the culprit if it ignores the directory but we don't remove it from traversal?
                 # No, we only check files with spec.
                 valid_dirs.append(d)
             dirs[:] = valid_dirs
        
        for file in files:
            filepath = os.path.join(root, file)
            relpath = os.path.relpath(filepath, root_dir)
            
            # Check default ignore files (exact match)
            if file in ignores:
                continue
                
            # Check gitignore
            if spec and spec.match_file(relpath):
                continue
                
            file_list.append(filepath)
            
    return file_list

def main():
    parser = argparse.ArgumentParser(description="Measure token count for files in a directory using Gemini API.")
    parser.add_argument("directory", help="Directory to scan")
    parser.add_argument("--key", help="Gemini API Key (optional, defaults to env GEMINI_API_KEY)", default=os.environ.get("GEMINI_API_KEY"))
    parser.add_argument("--model", help=f"Gemini model to use (default: {DEFAULT_MODEL})", default=DEFAULT_MODEL)
    parser.add_argument("--exclude", help="Additional directories to exclude (comma separated)", default="")
    
    args = parser.parse_args()

    if not args.key:
        print("Error: GEMINI_API_KEY not found. Please set the environment variable or pass --key.")
        sys.exit(1)

    genai.configure(api_key=args.key)
    model = genai.GenerativeModel(args.model)

    excludes = [e.strip() for e in args.exclude.split(',')] if args.exclude else []
    files = get_files_to_process(args.directory, exclude_patterns=excludes)
    print(f"Found {len(files)} files. Filtering text files...")
    
    text_files = []
    for f in tqdm(files, desc="Checking file types"):
        if is_text_file(f):
            text_files.append(f)
            
    print(f"Processing {len(text_files)} text files...")

    total_tokens = 0
    batch_texts = []
    
    # Process in batches
    with tqdm(total=len(text_files), desc="Counting tokens") as pbar:
        for i, filepath in enumerate(text_files):
            try:
                with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
                    content = f.read()
                    if content.strip():
                        batch_texts.append(content)
            except Exception as e:
                print(f"Failed to read {filepath}: {e}")
            
            if len(batch_texts) >= BATCH_SIZE or i == len(text_files) - 1:
                if batch_texts:
                    count = count_tokens_batch(model, batch_texts)
                    total_tokens += count
                    batch_texts = []
                pbar.update(BATCH_SIZE if i < len(text_files) - 1 else len(text_files) % BATCH_SIZE)

    print("\n" + "="*30)
    print(f"Directory: {args.directory}")
    print(f"Total Files Scanned: {len(files)}")
    print(f"Text Files Processed: {len(text_files)}")
    print(f"Total Tokens ({args.model}): {total_tokens:,}")
    print("="*30)

if __name__ == "__main__":
    main()
