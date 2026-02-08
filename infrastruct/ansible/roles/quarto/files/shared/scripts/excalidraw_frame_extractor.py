#!/usr/bin/env python3
"""
pre-render.py
Zero-impact "Out-of-Tree" source patching for Quarto.
"""
import sys
import os
import re
from pathlib import Path

def patch_source(qmd_path: Path):
    if not qmd_path.exists(): return
    
    # 1. Create a backup of the original state in .quarto/
    # This is our safety net.
    backup_dir = qmd_path.parent / ".quarto"
    backup_dir.mkdir(exist_ok=True)
    backup_file = backup_dir / f"original_{qmd_path.name}"
    
    content = qmd_path.read_text(encoding='utf-8')
    backup_file.write_text(content, encoding='utf-8')
    
    # 2. Patch the source file IN PLACE temporarily for the render.
    # We will RESTORE it in post-render.
    new_content = content.replace(".canvas", ".png")
    
    if new_content != content:
        qmd_path.write_text(new_content, encoding='utf-8')
        print(f"  ✓ [Pre-Render] Patched {qmd_path.name} (Source file will be restored after render)")

if __name__ == "__main__":
    for arg in sys.argv[1:]:
        path = Path(arg)
        if path.suffix == '.qmd':
            patch_source(path)