#!/usr/bin/env python3
"""
excalidraw_frame_extractor.py

Pre-render script for Quarto.
CRITICAL: PROTECTS ORIGINAL SOURCE FILES.
"""

import json
import sys
import re
import os
from pathlib import Path
from typing import Optional, Dict, Any, List, Tuple

# ... [Keep decompression and extraction helpers as is] ...

try:
    import lzstring
    HAS_LZSTRING = True
except ImportError:
    HAS_LZSTRING = False

try:
    from PIL import Image
    HAS_PIL = True
except ImportError:
    HAS_PIL = False


def decompress_excalidraw(compressed: str) -> Optional[Dict[str, Any]]:
    if not HAS_LZSTRING: return None
    try:
        lzs = lzstring.LZString()
        decompressed = lzs.decompressFromBase64(compressed)
        if decompressed: return json.loads(decompressed)
    except Exception: pass
    return None


def parse_excalidraw_md(filepath: Path) -> Tuple[Optional[Dict[str, Any]], Dict[str, str]]:
    content = filepath.read_text(encoding='utf-8')
    embedded_files = {}
    for match in re.finditer(r'(\w+):\s*\[\[([^\]]+)\]\]', content):
        file_hash, filename = match.groups()
        embedded_files[file_hash] = filename
    match = re.search(r'```compressed-json\n(.*?)\n```', content, re.DOTALL)
    if match:
        compressed = match.group(1).replace('\n', '')
        data = decompress_excalidraw(compressed)
        return data, embedded_files
    return None, embedded_files


def get_frame_crop_info(data: Dict[str, Any], frame_id: str) -> Optional[Dict[str, Any]]:
    elements = data.get('elements', [])
    frame = next((e for e in elements if e.get('id') == frame_id), None)
    if not frame: return None
    image = next((e for e in elements if e.get('type') == 'image'), None)
    if not image: return None
    return {
        'frame_x': frame.get('x', 0), 'frame_y': frame.get('y', 0),
        'frame_width': frame.get('width', 0), 'frame_height': frame.get('height', 0),
        'image_x': image.get('x', 0), 'image_y': image.get('y', 0),
        'image_width': image.get('width', 0), 'image_height': image.get('height', 0),
        'image_file_id': image.get('fileId'),
    }


def crop_image_to_frame(source_image: Path, output_path: Path, info: Dict[str, Any]) -> bool:
    if not HAS_PIL: return False
    try:
        img = Image.open(source_image)
        actual_w, actual_h = img.size
        scale_x = actual_w / info['image_width'] if info['image_width'] else 1
        scale_y = actual_h / info['image_height'] if info['image_height'] else 1
        rel_x, rel_y = info['frame_x'] - info['image_x'], info['frame_y'] - info['image_y']
        crop_left, crop_top = int(rel_x * scale_x), int(rel_y * scale_y)
        crop_right, crop_bottom = int((rel_x + info['frame_width']) * scale_x), int((rel_y + info['frame_height']) * scale_y)
        cropped = img.crop((max(0, crop_left), max(0, crop_top), min(actual_w, crop_right), min(actual_h, crop_bottom)))
        cropped.save(output_path, quality=95)
        print(f"  ✓ Extracted Excalidraw frame: {output_path.name}")
        return True
    except Exception: return False


def find_vault_root(start_dir: Path) -> Optional[Path]:
    current = start_dir.absolute()
    for _ in range(10):
        if (current / ".obsidian").exists(): return current
        if current.parent == current: break
        current = current.parent
    return None


def resolve_path(base_dir: Path, embed_path: str) -> Optional[Path]:
    filename = Path(embed_path).name
    local = base_dir / filename
    if local.exists(): return local
    vault_root = find_vault_root(base_dir)
    if vault_root:
        for folder in ["attachments", "Attachments", "assets", "Assets", "."]:
            attach_path = vault_root / folder / filename
            if attach_path.exists(): return attach_path
    return None


def convert_obsidian_syntax(qmd_path: Path):
    content = qmd_path.read_text(encoding='utf-8')
    base_dir = qmd_path.parent

    # 1. First fix standard markdown links to .canvas
    def fix_canvas_std(match):
        alt, path = match.groups()
        if path.endswith('.canvas'):
            stem = Path(path).stem
            for ext in ['.png', '.jpg', '.jpeg', '.svg']:
                resolved = resolve_path(base_dir, stem + ext)
                if resolved:
                    rel = os.path.relpath(resolved, base_dir)
                    return f"![{alt}]({rel})"
        return match.group(0)

    content = re.sub(r'!\[([^\]]*)\]\(([^)]+)\)', fix_canvas_std, content)

    # 2. Convert ![[Wiki Links]] to standard ![]()
    pattern_wiki = r'!\[\[([^\]|#]+)(?:\|([^\]#]+))?(?:#\^(?:frame=)?([^\]]+))?\]\](\{[^}]+\})?'

    def replace_wiki(match):
        embed_path, caption, frame_id, attrs = match.groups()
        caption, attrs = caption or "", attrs or ""
        just_basename = Path(embed_path).stem.replace('.excalidraw', '')

        # Handle Excalidraw Frames
        if frame_id:
            frame_path = base_dir / ".quarto" / "frames" / f"{just_basename}_{frame_id}.png"
            if frame_path.exists():
                return f"![{caption or frame_id}](.quarto/frames/{just_basename}_{frame_id}.png){attrs}"

        # Determine target file (handle .canvas swap)
        target_file = embed_path
        if embed_path.endswith('.canvas'):
            target_file = just_basename + ".png"

        resolved = resolve_path(base_dir, target_file)
        if resolved:
            rel_path = os.path.relpath(resolved, base_dir)
            return f"![{caption or just_basename}]({rel_path}){attrs}"

        return match.group(0)

    new_content = re.sub(pattern_wiki, replace_wiki, content)
    if new_content != content:
        qmd_path.write_text(new_content, encoding='utf-8')


def process_qmd(qmd_path: Path):
    print(f"\n{'='*60}\nProcessing: {qmd_path}")

    backup_dir = qmd_path.parent / ".quarto"
    backup_dir.mkdir(parents=True, exist_ok=True)
    backup_file = backup_dir / f"original_{qmd_path.name}"

    # CRITICAL FIX: If backup exists, the file is already "dirty" from a crashed render.
    # WE MUST NOT OVERWRITE THE BACKUP with dirty content.
    if backup_file.exists():
        print(f"  ↺ WARNING: Backup already exists. File might be dirty. NOT overwriting backup.")
    else:
        # File is clean, save the backup now.
        content = qmd_path.read_text(encoding='utf-8')
        backup_file.write_text(content, encoding='utf-8')
        print(f"  ✓ Saved clean source backup to {backup_file.name}")

    # Process extraction and syntax conversion normally...
    # (These only touch the actual .qmd, which we will restore later)
    convert_obsidian_syntax(qmd_path)


def main():
    for arg in sys.argv[1:]:
        path = Path(arg)
        if path.exists() and path.suffix == '.qmd':
            process_qmd(path)
    return 0

if __name__ == "__main__":
    sys.exit(main())