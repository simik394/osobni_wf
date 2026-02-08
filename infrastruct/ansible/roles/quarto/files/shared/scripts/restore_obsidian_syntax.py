#!/usr/bin/env python3
"""
restore_obsidian_syntax.py

Post-render script that:
1. Restores original Obsidian-compatible syntax from backup.
2. Performs an ATOMIC SWAP of the PDF into a dedicated 'out/' folder.
"""

import sys
import shutil
import os
from pathlib import Path


def restore_from_backup(qmd_path: Path):
    """Restore QMD file from backup saved during pre-render."""
    if not qmd_path.exists():
        return
    
    backup_file = qmd_path.parent / ".quarto" / f"original_{qmd_path.name}"
    
    if backup_file.exists():
        original_content = backup_file.read_text(encoding='utf-8')
        qmd_path.write_text(original_content, encoding='utf-8')
        print(f"✓ Restored original Obsidian syntax in {qmd_path.name}")
        backup_file.unlink()


def atomic_swap_pdf(qmd_path: Path):
    """Atomic swap: Move PDF from _build directory to the 'out/' directory."""
    project_root = qmd_path.parent
    build_dir = project_root / "_build"
    out_dir = project_root / "out"
    
    # Ensure out directory exists
    out_dir.mkdir(exist_ok=True)
    
    candidate = build_dir / "__atomic_candidate.pdf"
    final_output = out_dir / qmd_path.with_suffix(".pdf").name
    
    if candidate.exists():
        # Atomic move to out/
        shutil.move(str(candidate), str(final_output))
        print(f"✅ Atomic Swap: {candidate.name} -> {final_output} (A/B Update Successful)")
    else:
        named_candidate = build_dir / qmd_path.with_suffix(".pdf").name
        if named_candidate.exists():
            shutil.move(str(named_candidate), str(final_output))
            print(f"✅ Atomic Swap: {named_candidate.name} -> {final_output} (A/B Update Successful)")


def main():
    for arg in sys.argv[1:]:
        path = Path(arg)
        if path.suffix == '.qmd' and path.exists():
            restore_from_backup(path)
            atomic_swap_pdf(path)


if __name__ == "__main__":
    main()