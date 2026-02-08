#!/usr/bin/env python3
"""
excalidraw_frame_extractor.py

Pre-render script for Quarto that extracts Excalidraw frames by cropping the source image.
Also transforms Obsidian embeds to standard Markdown for Quarto compatibility.
"""

import json
import sys
import re
import os
from pathlib import Path
from typing import Optional, Dict, Any, List, Tuple

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
    """Decompress Excalidraw's LZ-string compressed JSON."""
    if not HAS_LZSTRING:
        return None
    try:
        lzs = lzstring.LZString()
        decompressed = lzs.decompressFromBase64(compressed)
        if decompressed:
            return json.loads(decompressed)
    except Exception as e:
        print(f"  Decompression error: {e}")
    return None


def parse_excalidraw_md(filepath: Path) -> Tuple[Optional[Dict[str, Any]], Dict[str, str]]:
    """Parse .excalidraw.md file, return (data, embedded_files_map)."""
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
    frame = None
    for elem in elements:
        if elem.get('id') == frame_id:
            frame = elem
            break
    if not frame: return None
    images = [e for e in elements if e.get('type') == 'image']
    if not images: return None
    image = images[0]
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
        crop_left, crop_top = max(0, crop_left), max(0, crop_top)
        crop_right, crop_bottom = min(actual_w, crop_right), min(actual_h, crop_bottom)
        if crop_right <= crop_left or crop_bottom <= crop_top: return False
        cropped = img.crop((crop_left, crop_top, crop_right, crop_bottom))
        cropped.save(output_path, quality=95)
        print(f"  ✓ Saved cropped frame: {output_path.name}")
        return True
    except Exception as e:
        print(f"  Error cropping: {e}")
        return False


def find_qmd_embeds(qmd_path: Path) -> List[Tuple[str, Optional[str]]]:
    content = qmd_path.read_text(encoding='utf-8')
    embeds = []
    pattern = r'!\[\[([^\]|#]+)(?:\|[^\]#]+)?(?:#\^(?:frame=)?([^\]]+))?\]\]'
    for match in re.finditer(pattern, content):
        path, frame_id = match.groups()
        embeds.append((path, frame_id))
    return embeds


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
        for folder in ["attachments", "Attachments", "assets", "Assets"]:
            attach_path = vault_root / folder / filename
            if attach_path.exists(): return attach_path
    return None


def convert_obsidian_embeds(qmd_path: Path):
    content = qmd_path.read_text(encoding='utf-8')
    base_dir = qmd_path.parent
    pattern = r'!\[\[([^\]|#]+)(?:\|([^\]#]+))?(?:#\^(?:frame=)?([^\]]+))?\]\](\{[^}]+\})?'
    
    def replace_embed(match):
        embed_path, caption, frame_id, attrs = match.groups()
        caption, attrs = caption or "", attrs or ""
        just_basename = Path(embed_path).stem.replace('.excalidraw', '')
        
        if frame_id:
            frame_path = base_dir / ".quarto" / "frames" / f"{just_basename}_{frame_id}.png"
            if frame_path.exists():
                return f"![{caption or frame_id}](.quarto/frames/{just_basename}_{frame_id}.png){attrs}"
        
        resolved = resolve_path(base_dir, embed_path)
        if resolved:
            rel_path = os.path.relpath(resolved, base_dir)
            return f"![{caption or just_basename}]({rel_path}){attrs}"
        return match.group(0)
    
    new_content = re.sub(pattern, replace_embed, content)
    if new_content != content:
        qmd_path.write_text(new_content, encoding='utf-8')
        print(f"  ✓ Transformed embeds to standard Markdown")


def restore_obsidian_syntax_manually(qmd_path: Path):
    """Regex-based restoration for cases where we can't just overwrite from backup."""
    content = qmd_path.read_text(encoding='utf-8')
    # Convert ![cap](path){attrs} back to ![[path|cap]]{attrs}
    # Matches both local frames and vault attachments
    pattern = r'!\[([^\]]*)\]\((?:\.quarto/frames/|(?:\.\./)+attachments/)?([^)]+)\)(\{[^}]+\})?'
    
    def replace_back(match):
        cap, path, attrs = match.groups()
        # Clean up path (remove our generated prefixes)
        fname = Path(path).name
        # Format back to Obsidian
        link = f"![[{fname}{'|' + cap if cap and cap != Path(fname).stem else ''}]]"
        return f"{link}{attrs or ''}"
    
    new_content = re.sub(pattern, replace_back, content)
    if new_content != content:
        qmd_path.write_text(new_content, encoding='utf-8')
        print(f"  ✓ Smart-cleaned Obsidian syntax (preserved your recent edits)")

def process_qmd(qmd_path: Path):
    print(f"\n{'='*60}\nProcessing: {qmd_path}")
    
    backup_dir = qmd_path.parent / ".quarto"
    backup_dir.mkdir(parents=True, exist_ok=True)
    backup_file = backup_dir / f"original_{qmd_path.name}"
    
    if backup_file.exists():
        # Check if the user modified the dirty file
        if qmd_path.stat().st_mtime > backup_file.stat().st_mtime + 1:
            print(f"  ⚠ Detected edits to dirty file. Running smart cleanup...")
            restore_obsidian_syntax_manually(qmd_path)
            # Update backup to current clean state
            backup_file.write_text(qmd_path.read_text(encoding='utf-8'), encoding='utf-8')
        else:
            print(f"  ↺ Recovering from crash: Restoring from backup")
            qmd_path.write_text(backup_file.read_text(encoding='utf-8'), encoding='utf-8')
    else:
        backup_file.write_text(qmd_path.read_text(encoding='utf-8'), encoding='utf-8')
        print(f"  ✓ Saved backup to {backup_file.name}")

    embeds = find_qmd_embeds(qmd_path)
    for embed_path, frame_id in embeds:
        if embed_path.endswith('.excalidraw') or embed_path.endswith('.excalidraw.md'):
            excalidraw_file = resolve_path(qmd_path.parent, embed_path)
            if excalidraw_file:
                data, embedded_files = parse_excalidraw_md(excalidraw_file)
                if data and frame_id:
                    info = get_frame_crop_info(data, frame_id)
                    if info:
                        file_id = info.get('image_file_id')
                        if file_id and file_id in embedded_files:
                            source_name = embedded_files[file_id]
                            source_path = excalidraw_file.parent / source_name
                            if source_path.exists():
                                frames_dir = qmd_path.parent / ".quarto" / "frames"
                                frames_dir.mkdir(parents=True, exist_ok=True)
                                output_path = frames_dir / f"{excalidraw_file.stem.replace('.excalidraw', '')}_{frame_id}.png"
                                crop_image_to_frame(source_path, output_path, info)

    convert_obsidian_embeds(qmd_path)


def main():
    if not HAS_LZSTRING or not HAS_PIL:
        print("Error: lzstring and Pillow required.")
        return 1
    for arg in sys.argv[1:]:
        path = Path(arg)
        if path.exists() and path.suffix == '.qmd':
            process_qmd(path)
    return 0

if __name__ == "__main__":
    sys.exit(main())
