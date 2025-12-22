#!/usr/bin/env python3
"""
scan.py - Parse markdown files using tree-sitter AST
Usage: cat files.txt | python scan.py --output notes.json

Supports multiprocessing for parallel file scanning.
"""
import sys
import json
import re
import argparse
import os
from pathlib import Path
from datetime import datetime
from typing import Optional
from dataclasses import dataclass, asdict
from multiprocessing import Pool, cpu_count
from functools import partial

try:
    from tree_sitter_languages import get_parser
    TREE_SITTER_AVAILABLE = True
except ImportError:
    TREE_SITTER_AVAILABLE = False
    print("Warning: tree-sitter-languages not installed, using regex fallback", file=sys.stderr)

try:
    import frontmatter
except ImportError:
    frontmatter = None

# Global parser instance (created per-process)
_PARSER = None
_FORCE_REGEX = False

def get_md_parser():
    """Get or create parser for current process."""
    global _PARSER
    if _PARSER is None:
        if TREE_SITTER_AVAILABLE and not _FORCE_REGEX:
            _PARSER = TreeSitterParser()
        else:
            _PARSER = RegexParser()
    return _PARSER


@dataclass
class NoteMetadata:
    # File properties
    path: str
    name: str
    extension: str
    size_bytes: int
    created: str
    modified: str
    
    # Content stats
    char_count: int
    word_count: int
    line_count: int
    
    # Structure (from tree-sitter)
    h1: int = 0
    h2: int = 0
    h3: int = 0
    h4: int = 0
    h5: int = 0
    h6: int = 0
    code_block_count: int = 0
    code_languages: list = None
    list_item_count: int = 0
    link_count: int = 0
    image_count: int = 0
    blockquote_count: int = 0
    table_count: int = 0
    
    # Obsidian
    frontmatter: dict = None
    has_frontmatter: bool = False
    tags: list = None
    wikilinks: list = None
    embeds: list = None
    external_links: list = None
    
    # Quality
    broken_links: list = None
    is_orphan: bool = False
    
    def __post_init__(self):
        self.code_languages = self.code_languages or []
        self.frontmatter = self.frontmatter or {}
        self.tags = self.tags or []
        self.wikilinks = self.wikilinks or []
        self.embeds = self.embeds or []
        self.external_links = self.external_links or []
        self.broken_links = self.broken_links or []


class TreeSitterParser:
    """Parse markdown using tree-sitter AST."""
    
    def __init__(self):
        self.parser = get_parser('markdown')
    
    def parse(self, content: str) -> dict:
        """Parse markdown and extract structure."""
        tree = self.parser.parse(content.encode('utf-8'))
        
        result = {
            'h1': 0, 'h2': 0, 'h3': 0, 'h4': 0, 'h5': 0, 'h6': 0,
            'code_block_count': 0,
            'code_languages': [],
            'list_item_count': 0,
            'link_count': 0,
            'image_count': 0,
            'blockquote_count': 0,
            'table_count': 0,
            'external_links': [],
        }
        
        self._walk_tree(tree.root_node, result, content)
        return result
    
    def _walk_tree(self, node, result: dict, content: str):
        """Recursively walk the AST."""
        node_type = node.type
        
        # Headings
        if node_type == 'atx_heading':
            # Count # characters to determine level
            text = content[node.start_byte:node.end_byte]
            level = len(text.split()[0]) if text.split() else 1
            level = min(level, 6)
            result[f'h{level}'] += 1
        
        # Code blocks
        elif node_type == 'fenced_code_block':
            result['code_block_count'] += 1
            # Extract language
            for child in node.children:
                if child.type == 'info_string':
                    lang = content[child.start_byte:child.end_byte].strip()
                    if lang and lang not in result['code_languages']:
                        result['code_languages'].append(lang)
        
        elif node_type == 'code_block':
            result['code_block_count'] += 1
        
        # Lists
        elif node_type == 'list_item':
            result['list_item_count'] += 1
        
        # Links
        elif node_type == 'link' or node_type == 'inline_link':
            result['link_count'] += 1
            # Try to extract URL
            for child in node.children:
                if child.type == 'link_destination':
                    url = content[child.start_byte:child.end_byte]
                    if url.startswith('http'):
                        result['external_links'].append(url)
        
        # Images  
        elif node_type == 'image':
            result['image_count'] += 1
        
        # Blockquotes
        elif node_type == 'block_quote':
            result['blockquote_count'] += 1
        
        # Tables
        elif node_type == 'table' or node_type == 'pipe_table':
            result['table_count'] += 1
        
        # Recurse into children
        for child in node.children:
            self._walk_tree(child, result, content)


class RegexParser:
    """Fallback regex-based parser."""
    
    def parse(self, content: str) -> dict:
        result = {
            'h1': 0, 'h2': 0, 'h3': 0, 'h4': 0, 'h5': 0, 'h6': 0,
            'code_block_count': 0,
            'code_languages': [],
            'list_item_count': 0,
            'link_count': 0,
            'image_count': 0,
            'blockquote_count': 0,
            'table_count': 0,
            'external_links': [],
        }
        
        for line in content.split('\n'):
            line = line.strip()
            # Headings
            if line.startswith('#'):
                match = re.match(r'^(#{1,6})\s', line)
                if match:
                    level = len(match.group(1))
                    result[f'h{level}'] += 1
            # Lists
            elif re.match(r'^[-*+]\s', line) or re.match(r'^\d+\.\s', line):
                result['list_item_count'] += 1
            # Blockquotes
            elif line.startswith('>'):
                result['blockquote_count'] += 1
        
        # Code blocks
        result['code_block_count'] = len(re.findall(r'^```', content, re.MULTILINE)) // 2
        
        # Code languages
        for match in re.finditer(r'^```(\w+)', content, re.MULTILINE):
            lang = match.group(1)
            if lang not in result['code_languages']:
                result['code_languages'].append(lang)
        
        # Links
        result['link_count'] = len(re.findall(r'\[([^\]]+)\]\(([^)]+)\)', content))
        
        # External links
        for match in re.finditer(r'\[([^\]]+)\]\((https?://[^)]+)\)', content):
            result['external_links'].append(match.group(2))
        
        # Images
        result['image_count'] = len(re.findall(r'!\[([^\]]*)\]\(([^)]+)\)', content))
        
        # Tables (simplified)
        result['table_count'] = len(re.findall(r'^\|.+\|$', content, re.MULTILINE)) // 3
        
        return result


def parse_frontmatter(content: str) -> dict:
    """Extract YAML frontmatter from markdown."""
    if frontmatter:
        try:
            post = frontmatter.loads(content)
            return dict(post.metadata)
        except Exception:
            pass
    
    if content.startswith('---'):
        parts = content.split('---', 2)
        if len(parts) >= 3:
            return {'_raw': parts[1].strip()}
    return {}


def extract_wikilinks(content: str) -> list[str]:
    """Extract [[wikilinks]] from content."""
    pattern = r'\[\[([^\]|]+)(?:\|[^\]]+)?\]\]'
    return list(set(re.findall(pattern, content)))


def extract_embeds(content: str) -> list[str]:
    """Extract ![[embeds]] from content."""
    pattern = r'!\[\[([^\]|]+)(?:\|[^\]]+)?\]\]'
    return list(set(re.findall(pattern, content)))


def extract_tags(content: str, fm: dict) -> list[str]:
    """Extract #tags from content and frontmatter."""
    # Inline tags (not inside code blocks)
    # Simple approach: find all #tags
    inline = re.findall(r'(?:^|\s)#([a-zA-Z][a-zA-Z0-9_/-]*)', content)
    
    # Frontmatter tags
    fm_tags = fm.get('tags', [])
    if isinstance(fm_tags, str):
        fm_tags = [t.strip() for t in fm_tags.split(',')]
    elif not isinstance(fm_tags, list):
        fm_tags = []
    
    return list(set(inline + fm_tags))


def scan_file(filepath: str) -> Optional[NoteMetadata]:
    """Scan a single markdown file and extract metadata."""
    md_parser = get_md_parser()
    path = Path(filepath.strip())
    
    if not path.exists() or not path.is_file():
        return None
    
    try:
        content = path.read_text(encoding='utf-8')
    except Exception as e:
        return NoteMetadata(
            path=str(path), name=path.stem, extension=path.suffix,
            size_bytes=0, created='', modified='',
            char_count=0, word_count=0, line_count=0,
        )
    
    stat = path.stat()
    fm = parse_frontmatter(content)
    structure = md_parser.parse(content)
    
    return NoteMetadata(
        # File properties
        path=str(path),
        name=path.stem,
        extension=path.suffix,
        size_bytes=stat.st_size,
        created=datetime.fromtimestamp(stat.st_ctime).isoformat(),
        modified=datetime.fromtimestamp(stat.st_mtime).isoformat(),
        
        # Content stats
        char_count=len(content),
        word_count=len(content.split()),
        line_count=content.count('\n') + 1,
        
        # Structure (from parser)
        **{k: v for k, v in structure.items() if k in [
            'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
            'code_block_count', 'code_languages',
            'list_item_count', 'link_count', 'image_count',
            'blockquote_count', 'table_count', 'external_links'
        ]},
        
        # Obsidian
        frontmatter=fm,
        has_frontmatter=bool(fm),
        tags=extract_tags(content, fm),
        wikilinks=extract_wikilinks(content),
        embeds=extract_embeds(content),
    )


def init_worker(force_regex):
    global _FORCE_REGEX
    _FORCE_REGEX = force_regex

def main():
    parser = argparse.ArgumentParser(description='Scan markdown files')
    parser.add_argument('--output', '-o', required=True, help='Output JSON file')
    parser.add_argument('--full', action='store_true', help='Full rescan mode')
    parser.add_argument('--workers', '-w', type=int, default=None, 
                        help='Number of worker processes (default: CPU count)')
    parser.add_argument('--orphans', help='List orphans from existing JSON')
    parser.add_argument('--broken', help='List broken links from existing JSON')
    parser.add_argument('--regex', action='store_true', help='Force regex parser even if tree-sitter is available')
    args = parser.parse_args()
    
    # Global flag for worker to know which parser to use
    global _FORCE_REGEX
    _FORCE_REGEX = args.regex
    
    # Report parser type
    if TREE_SITTER_AVAILABLE and not args.regex:
        print("Using tree-sitter parser", file=sys.stderr)
    elif args.regex:
        print("Using regex parser (forced)", file=sys.stderr)
    else:
        print("Using regex parser (fallback)", file=sys.stderr)
    
    # Read file list from stdin
    files = [line.strip() for line in sys.stdin if line.strip()]
    
    if not files:
        print("No files to scan", file=sys.stderr)
        sys.exit(0)
    
    # Determine worker count
    num_workers = args.workers or cpu_count()
    print(f"Scanning {len(files)} files with {num_workers} workers", file=sys.stderr)
    
    # Scan files in parallel
    with Pool(num_workers, initializer=init_worker, initargs=(args.regex,)) as pool:
        raw_results = pool.map(scan_file, files)
    
    # Filter None results and convert to dicts
    results = [asdict(r) for r in raw_results if r is not None]
    print(f"Successfully scanned {len(results)} files", file=sys.stderr)
    
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
    
    print(f"Total {len(existing)} notes in database", file=sys.stderr)


if __name__ == '__main__':
    main()
