#!/usr/bin/env python3
"""
scan.py - Parse markdown files and extract metadata
Usage: cat files.txt | python scan.py --output notes.json
"""
import sys
import json
import re
import argparse
from pathlib import Path
from datetime import datetime
from typing import Optional

try:
    import frontmatter
except ImportError:
    frontmatter = None


def parse_frontmatter(content: str) -> dict:
    """Extract YAML frontmatter from markdown."""
    if frontmatter:
        try:
            post = frontmatter.loads(content)
            return dict(post.metadata)
        except Exception:
            pass
    
    # Fallback: manual parsing
    if content.startswith('---'):
        parts = content.split('---', 2)
        if len(parts) >= 3:
            return {'_raw': parts[1].strip()}
    return {}


def extract_wikilinks(content: str) -> list[str]:
    """Extract [[wikilinks]] from content."""
    pattern = r'\[\[([^\]|]+)(?:\|[^\]]+)?\]\]'
    return re.findall(pattern, content)


def extract_embeds(content: str) -> list[str]:
    """Extract ![[embeds]] from content."""
    pattern = r'!\[\[([^\]|]+)(?:\|[^\]]+)?\]\]'
    return re.findall(pattern, content)


def extract_tags(content: str, fm: dict) -> list[str]:
    """Extract #tags from content and frontmatter."""
    # Inline tags
    inline = re.findall(r'(?:^|\s)#([a-zA-Z][a-zA-Z0-9_/-]*)', content)
    
    # Frontmatter tags
    fm_tags = fm.get('tags', [])
    if isinstance(fm_tags, str):
        fm_tags = [t.strip() for t in fm_tags.split(',')]
    elif not isinstance(fm_tags, list):
        fm_tags = []
    
    return list(set(inline + fm_tags))


def count_headings(content: str) -> dict[str, int]:
    """Count headings by level."""
    counts = {'h1': 0, 'h2': 0, 'h3': 0, 'h4': 0, 'h5': 0, 'h6': 0}
    for line in content.split('\n'):
        line = line.strip()
        if line.startswith('#'):
            match = re.match(r'^(#{1,6})\s', line)
            if match:
                level = len(match.group(1))
                counts[f'h{level}'] += 1
    return counts


def count_code_blocks(content: str) -> int:
    """Count fenced code blocks."""
    return len(re.findall(r'^```', content, re.MULTILINE)) // 2


def count_list_items(content: str) -> int:
    """Count list items (- or *)."""
    return len(re.findall(r'^[\s]*[-*]\s', content, re.MULTILINE))


def scan_file(filepath: str) -> Optional[dict]:
    """Scan a single markdown file and extract metadata."""
    path = Path(filepath.strip())
    
    if not path.exists() or not path.is_file():
        return None
    
    try:
        content = path.read_text(encoding='utf-8')
    except Exception as e:
        return {'path': str(path), 'error': str(e)}
    
    stat = path.stat()
    fm = parse_frontmatter(content)
    headings = count_headings(content)
    
    return {
        # File properties
        'path': str(path),
        'name': path.stem,
        'extension': path.suffix,
        'size_bytes': stat.st_size,
        'created': datetime.fromtimestamp(stat.st_ctime).isoformat(),
        'modified': datetime.fromtimestamp(stat.st_mtime).isoformat(),
        
        # Content stats
        'char_count': len(content),
        'word_count': len(content.split()),
        'line_count': content.count('\n') + 1,
        
        # Structure
        **headings,
        'code_block_count': count_code_blocks(content),
        'list_item_count': count_list_items(content),
        
        # Obsidian
        'frontmatter': fm,
        'has_frontmatter': bool(fm),
        'tags': extract_tags(content, fm),
        'wikilinks': extract_wikilinks(content),
        'embeds': extract_embeds(content),
        
        # Quality (placeholder - computed later)
        'broken_links': [],
        'is_orphan': False,
    }


def main():
    parser = argparse.ArgumentParser(description='Scan markdown files')
    parser.add_argument('--output', '-o', required=True, help='Output JSON file')
    parser.add_argument('--full', action='store_true', help='Full rescan mode')
    parser.add_argument('--orphans', help='List orphans from existing JSON')
    parser.add_argument('--broken', help='List broken links from existing JSON')
    args = parser.parse_args()
    
    # Read file list from stdin
    files = [line.strip() for line in sys.stdin if line.strip()]
    
    if not files:
        print("No files to scan", file=sys.stderr)
        sys.exit(0)
    
    # Scan each file
    results = []
    for filepath in files:
        result = scan_file(filepath)
        if result:
            results.append(result)
            print(f"Scanned: {filepath}", file=sys.stderr)
    
    # Load existing data if incremental
    output_path = Path(args.output)
    existing = {}
    if output_path.exists() and not args.full:
        try:
            with open(output_path) as f:
                for note in json.load(f):
                    existing[note['path']] = note
        except Exception:
            pass
    
    # Merge results
    for note in results:
        existing[note['path']] = note
    
    # Write output
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, 'w') as f:
        json.dump(list(existing.values()), f, indent=2)
    
    print(f"Scanned {len(results)} files, total {len(existing)} in database", file=sys.stderr)


if __name__ == '__main__':
    main()
