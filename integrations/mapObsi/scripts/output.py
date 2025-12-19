#!/usr/bin/env python3
"""
output.py - Convert JSON to other formats (CSV, SQLite)
Usage: python output.py --input notes.json --format csv --output notes.csv
"""
import json
import csv
import sqlite3
import argparse
from pathlib import Path


def flatten_note(note: dict) -> dict:
    """Flatten nested fields for CSV export."""
    flat = {}
    for key, value in note.items():
        if key == 'frontmatter':
            # Skip complex nested structure
            flat['has_frontmatter'] = bool(value)
        elif isinstance(value, list):
            flat[key] = '|'.join(str(v) for v in value)
            flat[f'{key}_count'] = len(value)
        elif isinstance(value, dict):
            for k, v in value.items():
                flat[f'{key}_{k}'] = v
        else:
            flat[key] = value
    return flat


def to_csv(notes: list[dict], output_path: str):
    """Export notes to CSV."""
    if not notes:
        print("No notes to export")
        return
    
    flat_notes = [flatten_note(n) for n in notes]
    
    # Get all possible keys
    all_keys = set()
    for note in flat_notes:
        all_keys.update(note.keys())
    
    # Sort keys for consistent output
    fieldnames = sorted(all_keys)
    
    with open(output_path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction='ignore')
        writer.writeheader()
        writer.writerows(flat_notes)
    
    print(f"Exported {len(notes)} notes to {output_path}")


def to_sqlite(notes: list[dict], output_path: str):
    """Export notes to SQLite database."""
    conn = sqlite3.connect(output_path)
    cursor = conn.cursor()
    
    # Create tables
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS notes (
            path TEXT PRIMARY KEY,
            name TEXT,
            size_bytes INTEGER,
            created TEXT,
            modified TEXT,
            char_count INTEGER,
            word_count INTEGER,
            line_count INTEGER,
            h1 INTEGER,
            h2 INTEGER,
            h3 INTEGER,
            code_block_count INTEGER,
            list_item_count INTEGER,
            has_frontmatter INTEGER,
            is_orphan INTEGER
        )
    ''')
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS tags (
            note_path TEXT,
            tag TEXT,
            FOREIGN KEY (note_path) REFERENCES notes(path)
        )
    ''')
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS links (
            source_path TEXT,
            target TEXT,
            is_embed INTEGER,
            FOREIGN KEY (source_path) REFERENCES notes(path)
        )
    ''')
    
    # Insert data
    for note in notes:
        cursor.execute('''
            INSERT OR REPLACE INTO notes VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        ''', (
            note['path'],
            note['name'],
            note['size_bytes'],
            note['created'],
            note['modified'],
            note['char_count'],
            note['word_count'],
            note['line_count'],
            note.get('h1', 0),
            note.get('h2', 0),
            note.get('h3', 0),
            note.get('code_block_count', 0),
            note.get('list_item_count', 0),
            1 if note.get('has_frontmatter') else 0,
            1 if note.get('is_orphan') else 0,
        ))
        
        # Insert tags
        cursor.execute('DELETE FROM tags WHERE note_path = ?', (note['path'],))
        for tag in note.get('tags', []):
            cursor.execute('INSERT INTO tags VALUES (?, ?)', (note['path'], tag))
        
        # Insert links
        cursor.execute('DELETE FROM links WHERE source_path = ?', (note['path'],))
        for link in note.get('wikilinks', []):
            cursor.execute('INSERT INTO links VALUES (?, ?, 0)', (note['path'], link))
        for embed in note.get('embeds', []):
            cursor.execute('INSERT INTO links VALUES (?, ?, 1)', (note['path'], embed))
    
    conn.commit()
    conn.close()
    print(f"Exported {len(notes)} notes to {output_path}")


def main():
    parser = argparse.ArgumentParser(description='Convert notes JSON to other formats')
    parser.add_argument('--input', '-i', required=True, help='Input JSON file')
    parser.add_argument('--format', '-f', choices=['csv', 'sqlite'], required=True)
    parser.add_argument('--output', '-o', required=True, help='Output file')
    args = parser.parse_args()
    
    with open(args.input) as f:
        notes = json.load(f)
    
    if args.format == 'csv':
        to_csv(notes, args.output)
    elif args.format == 'sqlite':
        to_sqlite(notes, args.output)


if __name__ == '__main__':
    main()
